import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const authSecret = process.env.AUTH_SECRET ?? "project-a-dev-secret-change-me";
const authUrl =
  process.env.AUTH_URL ??
  process.env.NEXTAUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.RENDER_EXTERNAL_URL;

if (authUrl) {
  // The custom Node server listens on 0.0.0.0 inside Render, so pin Auth.js
  // to the public origin before it builds OAuth callback URLs.
  process.env.AUTH_URL ??= authUrl;
}

export const isAuthConfigured = Boolean(
  process.env.AUTH_SECRET &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET
);

export const { auth, handlers } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret,
  trustHost: true,
  session: {
    strategy: "database",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "missing-google-client-id",
      clientSecret:
        process.env.AUTH_GOOGLE_SECRET ?? "missing-google-client-secret",
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }

      return session;
    },
  },
});
