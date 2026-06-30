import NextAuth, { type AuthOptions, type User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

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

        const user = USERS.find(
          (u) => u.email.toLowerCase() === credentials.email.toLowerCase(),
        )

        if (!user) {
          return null
        }

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
