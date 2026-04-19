import styles from "./page.module.css";
import { requireAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdminSession();

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Admin only</p>
        <h1>Project-A admin shell</h1>
        <p>
          This route is protected server-side and only available to users whose
          `User.role` is `ADMIN`.
        </p>
        <ul className={styles.list}>
          <li>Signed in as: {session.user.email ?? session.user.name}</li>
          <li>Role: {session.user.role}</li>
          <li>Foundation status: auth, sessions, and admin guards are wired.</li>
        </ul>
      </section>
    </main>
  );
}
