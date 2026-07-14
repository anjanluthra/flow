import NextAuth, { type AuthOptions, type User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'

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
          if (!expectedPassword || credentials.password !== expectedPassword) {
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
          if (!dbUser?.password_hash) return null

          const ok = await bcrypt.compare(credentials.password, dbUser.password_hash)
          if (!ok) return null

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
