import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const isProduction = process.env.NODE_ENV === "production";
const shouldValidateAuthEnv =
  isProduction && process.env.npm_lifecycle_event !== "build";
const authSecret = process.env.AUTH_SECRET?.trim();
const googleClientId = process.env.AUTH_GOOGLE_ID?.trim();
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
const authUrl =
  process.env.AUTH_URL ??
  process.env.NEXTAUTH_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  null;

if (authUrl) {
  // The custom Node server listens on 0.0.0.0 inside Render, so pin Auth.js
  // to the public origin before it builds OAuth callback URLs.
  process.env.AUTH_URL ??= authUrl;
}

export const isAuthConfigured = Boolean(
  authSecret &&
    googleClientId &&
    googleClientSecret
);

if (shouldValidateAuthEnv) {
  const missing = [
    !authSecret ? "AUTH_SECRET" : null,
    !googleClientId ? "AUTH_GOOGLE_ID" : null,
    !googleClientSecret ? "AUTH_GOOGLE_SECRET" : null,
    !authUrl ? "AUTH_URL, NEXTAUTH_URL, or RENDER_EXTERNAL_URL" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Project-A auth is misconfigured for production. Missing: ${missing.join(", ")}.`
    );
  }
}

export const { auth, handlers } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret,
  trustHost: true,
  session: {
    strategy: "database",
  },
  providers: isAuthConfigured
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      ]
    : [],
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
