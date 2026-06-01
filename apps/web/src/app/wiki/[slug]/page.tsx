import { notFound } from "next/navigation";
import { getWikiPage, WIKI_PAGE_SLUGS } from "../wiki-data";
import { WikiPageView } from "../wiki-page-view";

export default async function WikiSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getWikiPage(slug);

  if (!page) {
    notFound();
  }

  return <WikiPageView page={page} />;
}

export function generateStaticParams() {
  return WIKI_PAGE_SLUGS.map((slug) => ({ slug }));
}
