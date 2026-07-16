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
// Hardcoded users
// ---------------------------------------------------------------------------

const USERS: Array<{
  id: string
  email: string
  name: string
  role: string
  envKey: string
}> = [
  {
    id: '1',
    email: 'admin@joinindexed.com',
    name: 'Anjan',
    role: 'admin',
    envKey: 'AUTH_PASSWORD_ANJAN',
  },
  {
    id: '2',
    email: 'kate@joinindexed.com',
    name: 'Kate',
    role: 'user',
    envKey: 'AUTH_PASSWORD_KATE',
  },
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

        // 1. Founding users authenticate against env-var passwords (unchanged).
        const user = USERS.find(
          (u) => u.email.toLowerCase() === credentials.email.toLowerCase(),
        )

        if (user) {
          const expectedPassword = process.env[user.envKey]
          if (!expectedPassword || !safeEqual(credentials.password, expectedPassword)) {
            return null
          }
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          } as User
        }

        // 2. Users added via Settings authenticate against the DB (bcrypt).
        try {
          const result = await query(
            `SELECT id, email, full_name, role, password_hash
             FROM users
             WHERE lower(email) = lower($1) AND is_active = true`,
            [credentials.email],
          )
          const dbUser = result.rows[0]
          // Always run a bcrypt compare (real hash or dummy) so an unknown email
          // costs the same as a known one — no timing-based enumeration.
          const ok = await bcrypt.compare(credentials.password, dbUser?.password_hash ?? DUMMY_HASH)
          if (!dbUser?.password_hash || !ok) return null

          return {
            id: String(dbUser.id),
            email: dbUser.email,
            name: dbUser.full_name ?? dbUser.email,
            role: dbUser.role,
          } as User
        } catch {
          // DB unavailable — only env users can log in.
          return null
        }
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
