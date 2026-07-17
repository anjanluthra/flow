import NextAuth, { type AuthOptions, type User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { timingSafeEqual } from 'crypto'
import { query } from '@/lib/db'

// Warn loudly if the JWT secret isn't configured in production — without it
// NextAuth falls back to an insecure key. (A warning, not a throw, so it can't
// break the build if the secret is only present at runtime.)
if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_SECRET) {
  console.error('SECURITY: NEXTAUTH_SECRET is not set — sessions are not securely signed.')
}

// A pre-computed bcrypt hash we compare against on the "no such user" path so an
// unknown email takes the same time as a real one (defeats user enumeration by
// timing). The value is irrelevant — it just needs to be a valid hash.
const DUMMY_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO3f3x6q2Z9Qm8Kx0m6oq0Qp8Yy6uS0K'

// Constant-time string comparison (avoids leaking the env password via timing).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    // Still do a compare of equal-length buffers so length isn't a fast path.
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

// ---------------------------------------------------------------------------
// Founding-account fallback
//
// Auth is DB-first: everyone signs in against their bcrypt password in the
// users table. These env-var passwords are a FALLBACK — a founding account can
// always sign in with its env password *as long as the env var is set*, even
// after it has a DB password. To fully retire env auth, DELETE the AUTH_PASSWORD_*
// vars in Vercel (deleting the var disables the fallback). This avoids any
// lockout if a DB password is forgotten or mis-set.
// ---------------------------------------------------------------------------

const FOUNDING: Array<{
  email: string
  name: string
  role: string
  envKey: string
}> = [
  { email: 'admin@joinindexed.com', name: 'Anjan', role: 'admin', envKey: 'AUTH_PASSWORD_ANJAN' },
  { email: 'luthraanjan@gmail.com', name: 'Anjan', role: 'admin', envKey: 'AUTH_PASSWORD_ANJAN' },
  { email: 'kate@joinindexed.com', name: 'Kate', role: 'user', envKey: 'AUTH_PASSWORD_KATE' },
]

// ---------------------------------------------------------------------------
// NextAuth config
// ---------------------------------------------------------------------------

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        const email = credentials.email.toLowerCase()

        // 1. DB-first: everyone signs in against their bcrypt password hash.
        let dbUser: { id: string; email: string; full_name: string | null; role: string; password_hash: string | null } | null = null
        try {
          const result = await query(
            `SELECT id, email, full_name, role, password_hash
             FROM users
             WHERE lower(email) = lower($1) AND is_active = true`,
            [email],
          )
          dbUser = result.rows[0] ?? null
        } catch {
          // DB unavailable — fall through to the bootstrap path below.
        }

        if (dbUser?.password_hash) {
          const ok = await bcrypt.compare(credentials.password, dbUser.password_hash)
          if (ok) {
            return { id: String(dbUser.id), email: dbUser.email, name: dbUser.full_name ?? dbUser.email, role: dbUser.role } as User
          }
          // Wrong DB password — fall through to the env fallback (recovery), so
          // a mis-set or forgotten DB password can never lock a founder out
          // while the env var still exists.
        }

        // 2. Env fallback: a founding account may sign in with its env-var
        //    password whenever the var is set (delete the var to disable this).
        const founder = FOUNDING.find((u) => u.email === email)
        if (founder) {
          const expected = process.env[founder.envKey]
          if (expected && safeEqual(credentials.password, expected)) {
            return {
              id: dbUser ? String(dbUser.id) : founder.email,
              email: founder.email,
              name: dbUser?.full_name ?? founder.name,
              role: dbUser?.role ?? founder.role,
            } as User
          }
        }

        // 3. Nothing matched. If we didn't already run a real bcrypt compare,
        //    run a dummy one so timing doesn't reveal whether the account exists.
        if (!dbUser?.password_hash) await bcrypt.compare(credentials.password, DUMMY_HASH)
        return null
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    // Re-auth weekly instead of NextAuth's 30-day default.
    maxAge: 7 * 24 * 60 * 60,
  },

  // Harden the session cookie: httpOnly + sameSite=lax + secure in production.
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as User & { role: string }).role
        token.name = user.name
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string
        session.user.name = token.name as string
      }
      return session
    },
  },

  pages: {
    signIn: '/auth/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
