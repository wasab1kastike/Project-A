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
const adminEmail = process.env.ADMIN_EMAIL?.trim();
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

function isUnsafePlaceholder(value: string | null | undefined) {
  return value ? unsafePlaceholderValues.has(value.trim().toLowerCase()) : false;
}

function formatMissingProductionAuthMessage() {
  const missing = [
    !authSecret ? "AUTH_SECRET" : null,
    !googleClientId ? "AUTH_GOOGLE_ID" : null,
    !googleClientSecret ? "AUTH_GOOGLE_SECRET" : null,
    !authUrl ? "AUTH_URL, NEXTAUTH_URL, or RENDER_EXTERNAL_URL" : null,
  ].filter(Boolean);
  const placeholders = [
    isUnsafePlaceholder(authSecret) ? "AUTH_SECRET" : null,
    isUnsafePlaceholder(googleClientId) ? "AUTH_GOOGLE_ID" : null,
    isUnsafePlaceholder(googleClientSecret) ? "AUTH_GOOGLE_SECRET" : null,
  ].filter(Boolean);
  const details = [
    missing.length > 0 ? `Missing: ${missing.join(", ")}` : null,
    placeholders.length > 0
      ? `Replace placeholder values for: ${placeholders.join(", ")}`
      : null,
  ].filter(Boolean);

  return [
    "Project-A auth is misconfigured for production.",
    details.join(" "),
    "On Render, set AUTH_SECRET, AUTH_GOOGLE_ID, and AUTH_GOOGLE_SECRET in the service settings.",
    "RENDER_EXTERNAL_URL is accepted as the public auth origin, so AUTH_URL is only needed for a custom domain.",
    "ADMIN_EMAIL is used by the seed flow to bootstrap the first admin account.",
  ]
    .filter(Boolean)
    .join(" ");
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
  if (!adminEmail) {
    console.warn(
      "Project-A admin bootstrap is not configured. Set ADMIN_EMAIL in Render if you want the seed flow to create the first admin account."
    );
  }

  if (
    !authSecret ||
    !googleClientId ||
    !googleClientSecret ||
    !authUrl ||
    isUnsafePlaceholder(authSecret) ||
    isUnsafePlaceholder(googleClientId) ||
    isUnsafePlaceholder(googleClientSecret)
  ) {
    throw new Error(formatMissingProductionAuthMessage());
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
