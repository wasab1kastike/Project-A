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
const databaseUrl = process.env.DATABASE_URL?.trim();
const authUrl =
  process.env.AUTH_URL ??
  process.env.NEXTAUTH_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  null;
const unsafePlaceholderValues = new Set([
  "replace-me",
  "replace-with-a-long-random-string",
  "admin@example.com",
]);
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const sessionUpdateAgeSeconds = 60 * 60 * 12;

function isUnsafePlaceholder(value: string | null | undefined) {
  return value ? unsafePlaceholderValues.has(value.trim().toLowerCase()) : false;
}

function hasUnsafeDatabaseUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /postgresql:\/\/postgres:postgres@/i.test(value);
}

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
    !databaseUrl ? "DATABASE_URL" : null,
  ].filter(Boolean);
  const placeholders = [
    isUnsafePlaceholder(authSecret) ? "AUTH_SECRET" : null,
    isUnsafePlaceholder(googleClientId) ? "AUTH_GOOGLE_ID" : null,
    isUnsafePlaceholder(googleClientSecret) ? "AUTH_GOOGLE_SECRET" : null,
  ].filter(Boolean);
  const insecureConfig = [
    hasUnsafeDatabaseUrl(databaseUrl)
      ? "DATABASE_URL (uses default postgres:postgres credentials)"
      : null,
  ].filter(Boolean);

  if (
    missing.length > 0 ||
    placeholders.length > 0 ||
    insecureConfig.length > 0
  ) {
    const details = [
      missing.length > 0 ? `Missing: ${missing.join(", ")}` : null,
      placeholders.length > 0
        ? `Replace placeholder values for: ${placeholders.join(", ")}`
        : null,
      insecureConfig.length > 0
        ? `Fix insecure values for: ${insecureConfig.join(", ")}`
        : null,
    ].filter(Boolean);

    throw new Error(
      `Project-A auth is misconfigured for production. ${details.join(" ")}.`
    );
  }
}

export const { auth, handlers } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret,
  // Only safe behind a trusted reverse proxy that sanitizes forwarded headers.
  // Keep AUTH_URL explicit for custom domains and non-Render environments.
  trustHost: true,
  session: {
    strategy: "database",
    maxAge: sessionMaxAgeSeconds,
    updateAge: sessionUpdateAgeSeconds,
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
