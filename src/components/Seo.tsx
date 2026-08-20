import { Helmet } from "react-helmet-async";

const SITE_URL = "https://jbchlive.lovable.app";
const SITE_NAME = "Live Word Mission";

interface SeoProps {
  title: string;
  description: string;
  /** Route path starting with "/" — used for canonical and og:url. */
  path: string;
  image?: string | null;
  type?: "website" | "article" | "video.other";
  /** Optional JSON-LD object rendered as structured data. */
  jsonLd?: Record<string, unknown>;
  noindex?: boolean;
}

const Seo = ({
  title,
  description,
  path,
  image,
  type = "website",
  jsonLd,
  noindex = false,
}: SeoProps) => {
  const url = `${SITE_URL}${path}`;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      {image && <meta property="og:image" content={image} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}

      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
};

export default Seo;
