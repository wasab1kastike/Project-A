import Link from "next/link";

export default function WikiNotFound() {
  return (
    <div>
      <h2>Page not found</h2>
      <p>That wiki page doesn&apos;t exist.</p>
      <Link href="/wiki">← Back to Wiki</Link>
    </div>
  );
}
