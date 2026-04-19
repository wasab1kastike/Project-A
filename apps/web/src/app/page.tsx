import styles from "./page.module.css";
import { auth, isAuthConfigured } from "@/auth";
import { SessionActions } from "@/components/session-actions";

export const dynamic = "force-dynamic";

const stack = [
  "Next.js 16 App Router",
  "TypeScript 5",
  "Auth.js + Google sign-in",
  "Prisma ORM + PostgreSQL",
  "Role-based admin access",
  "Server-side background worker next",
];

const nextSteps = [
  "Create the first season bootstrap flow",
  "Add fortress and cycle mutations on top of the Prisma models",
  "Wire realtime updates after gameplay state is persisted",
];

export default async function Home() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const userLabel = session?.user?.name ?? session?.user?.email ?? "Commander";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>M0 in progress</p>
        <h1>Project-A now has app, auth, database, and admin foundations.</h1>
        <p className={styles.lead}>
          The repo already runs as a real Next.js app. M0 now adds Prisma data
          models, Google sign-in wiring, database-backed sessions, and a
          server-enforced admin shell.
        </p>
      </section>

      <section className={styles.layout}>
        <div className={styles.grid}>
          <article className={styles.card}>
            <span className={styles.cardLabel}>Cycle model</span>
            <h2>Registration-first season loop</h2>
            <p>
              Each season moves through registration, active play, resolution,
              and then resets into a fresh registration window.
            </p>
          </article>

          <article className={styles.card}>
            <span className={styles.cardLabel}>Current app</span>
            <h2>`apps/web` is the product shell</h2>
            <p>
              The web app now owns route handlers, auth state, Prisma access,
              and the initial admin-only surface for moderation and control
              tools.
            </p>
          </article>

          <article className={styles.cardWide}>
            <span className={styles.cardLabel}>Chosen stack</span>
            <ul className={styles.list}>
              {stack.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className={styles.cardWide}>
            <span className={styles.cardLabel}>Next implementation steps</span>
            <ol className={styles.list}>
              {nextSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>
        </div>

        <aside className={styles.sidebar}>
          <article className={styles.panel}>
            <span className={styles.cardLabel}>Session</span>
            <h2>{session?.user ? `Signed in as ${userLabel}` : "Spectator mode"}</h2>
            <p>
              {session?.user
                ? "Your session comes from the Auth.js Prisma adapter and is readable on the server."
                : "Unauthenticated visitors remain spectators. Google sign-in enables authenticated access once OAuth credentials are configured."}
            </p>
            <dl className={styles.metaList}>
              <div className={styles.metaRow}>
                <dt>Auth configured</dt>
                <dd>{isAuthConfigured ? "Yes" : "No"}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Current role</dt>
                <dd>{session?.user?.role ?? "SPECTATOR"}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt>Admin nav</dt>
                <dd>{isAdmin ? "Visible" : "Hidden"}</dd>
              </div>
            </dl>
            <SessionActions
              authConfigured={isAuthConfigured}
              isAuthenticated={Boolean(session?.user)}
              isAdmin={isAdmin}
            />
          </article>

          <article className={styles.panel}>
            <span className={styles.cardLabel}>Database</span>
            <h2>Prisma models cover auth and gameplay</h2>
            <p>
              Users, sessions, cycles, fortresses, chat, score events, winner
              requests, and cycle history now live in the same PostgreSQL
              schema.
            </p>
            <ul className={styles.listCompact}>
              <li>Primary local target: Docker Compose PostgreSQL</li>
              <li>Fallback local verification: Prisma local dev database</li>
              <li>First admin role comes from `ADMIN_EMAIL` seed bootstrap</li>
            </ul>
          </article>
        </aside>
      </section>
    </main>
  );
}
