import { NextAuthOptions } from "next-auth"
import GitHubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import { createHash } from "crypto"

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt", // No database needed - zero cost
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // On sign-in, generate deterministic user_id from OAuth provider ID
      if (account && profile) {
        const userId = createHash('sha256')
          .update(`${account.provider}:${account.providerAccountId}`)
          .digest('hex')
          .substring(0, 16)

        token.userId = userId
      }
      return token
    },
    async session({ session, token }) {
      // Add user_id to session for client-side access
      if (session.user) {
        (session.user as any).id = token.userId
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
}
