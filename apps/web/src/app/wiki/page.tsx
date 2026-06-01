import { getWikiPage } from "./wiki-data";
import { WikiPageView } from "./wiki-page-view";

export default function WikiIndexPage() {
  const page = getWikiPage("getting-started");

  if (!page) {
    return null;
  }

  return <WikiPageView page={page} />;
}
