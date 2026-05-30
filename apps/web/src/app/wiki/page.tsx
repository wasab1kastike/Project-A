import { notFound } from "next/navigation";
import { getWikiPage } from "./content-loader";

export default async function WikiIndexPage() {
  const result = await getWikiPage("index");
  if (!result) notFound();
  return <div dangerouslySetInnerHTML={{ __html: result.content }} />;
}
