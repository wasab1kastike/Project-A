import { notFound } from "next/navigation";
import { getWikiPage } from "../content-loader";

export default async function WikiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getWikiPage(slug);

  if (!result) notFound();

  return (
    <article>
      <div dangerouslySetInnerHTML={{ __html: result.content }} />
    </article>
  );
}

export async function generateStaticParams() {
  const slugs = [
    "getting-started",
    "races",
    "economy",
    "army",
    "expansion",
    "combat",
    "diplomacy",
    "trade",
    "abilities",
  ];
  return slugs.map((slug) => ({ slug }));
}
