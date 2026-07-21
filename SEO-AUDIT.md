# NoxRev Shopify Theme SEO Audit

## Scope

This pass covers technical SEO and metadata only. It does not change layout, styling, JavaScript, loading behavior, rendering, section architecture, UX, or storefront functionality.

## Implemented changes

- Added page-type-aware fallback titles and descriptions while preserving Shopify Admin SEO descriptions and custom titles where they are available.
- Added unique title and description fallbacks for the homepage, products, collections, collection index, search, cart, About, Contact, FAQ, Find Your iPad Model, generic pages, blog, articles, policies, 404, password, and gift card pages.
- Kept the canonical tag centralized and aligned Open Graph, Twitter, and breadcrumb URLs with Shopify's canonical URL.
- Added `noindex,follow` only to utility or non-landing pages: search, cart, 404, password, and gift card pages. No important product, collection, content, blog, or article template is marked `noindex` by theme code.
- Completed Open Graph coverage for title, description, image, URL, type, site name, and image alt text.
- Completed Twitter Card coverage for card type, title, description, URL, image, and image alt text.
- Added a configurable default social sharing image and selected an existing NoxRev hero image as the current fallback. Page-specific product, collection, article, or page images still take priority.
- Retained Shopify's built-in Product JSON-LD output and corrected product Open Graph price properties to `product:price:amount` and `product:price:currency`.
- Added Organization JSON-LD site-wide, using Shopify's brand logo when one is configured.
- Added BreadcrumbList JSON-LD to products, collections, the collection index, pages, blogs, articles, and policy pages.
- Added meaningful alt fallbacks to important product, collection, blog, article, About, FAQ, model-guide, and feature images. Decorative icons and backgrounds remain intentionally empty.
- Replaced generic configured alt text for product features, accessory cards, real-life video posters, product modes, and compatible iPad models with specific descriptions.
- Verified every mapped storefront template has exactly one page-level H1.
- Reviewed existing internal links in the header, footer, About CTA, FAQ, Contact, cart, collections, product cards, and model finder. No additional link was added because the remaining opportunities would require visible editorial or UX changes.

## Page audit

| Page or template | SEO result |
| --- | --- |
| Homepage (`index.json`) | Keyword-focused fallback title and description, canonical, complete social metadata, Organization schema, one H1, meaningful hero/product alt text. |
| Product (`product.json`) | Unique product-derived metadata, canonical, Product and Breadcrumb schema, product social type and price data, one H1, improved feature/media alt text. |
| Accessory product (`product.accessory.json`) | Product-derived metadata and schema coverage shared with the main product template; accessory image alt text improved. |
| Collection (`collection.json`) | Collection-derived metadata, canonical, Breadcrumb schema, complete social tags, one H1, product-card alt text. |
| Collection index (`list-collections.json`) | Unique shop title/description, canonical, Breadcrumb schema, one H1, collection-image alt fallback. |
| Search (`search.json`) | Query-aware metadata, canonical, complete social tags, intentional `noindex,follow`, one H1. |
| Cart (`cart.json`) | Unique cart metadata, canonical, complete social tags, intentional `noindex,follow`, one H1. |
| About (`page.about.json`) | Unique brand-focused metadata, canonical, Breadcrumb schema, one H1, important editorial image alt fallbacks. |
| Contact (`page.contact.json`) | Unique support-focused metadata, canonical, Breadcrumb schema, one H1, existing model-guide link retained. |
| FAQ (`page.faq.json`) | Unique help-focused metadata, canonical, Breadcrumb schema, one H1, hero-image alt fallback. |
| Find Your iPad Model (`page.find-ipad-model.json`) | Unique compatibility-focused metadata, canonical, Breadcrumb schema, one H1, model-specific image alt text. |
| Generic pages (`page.json`) | Page-derived title and content-derived description fallbacks, canonical, Breadcrumb schema, one H1. |
| Blog (`blog.json`) | Blog-specific metadata, canonical, Breadcrumb schema, article-image alt fallbacks, one H1. |
| Article (`article.json`) | Article title and excerpt/content metadata, canonical, article Open Graph type, Breadcrumb schema, hero-image alt fallback, one H1. |
| 404 (`404.json`) | Unique recovery-focused metadata, canonical, complete social tags, intentional `noindex,follow`, one H1. |
| Policies | Policy-derived metadata and Breadcrumb schema are handled centrally; the policy section contains one H1. |
| Password (`password.json`) | Unique opening-soon metadata, canonicalized to the store origin, intentional `noindex,follow`, one H1. |
| Gift card (`gift_card.liquid`) | Unique private utility metadata, canonical fallback, complete social tags, intentional `noindex,follow`, one H1. |

## Validation

- Shopify Theme Check: 87 files inspected, no Liquid errors. Four existing warnings remain: three remote-font performance warnings and one unused assignment. They are outside this SEO-only scope.
- JSON parsing: all 16 template/config JSON files passed local parsing.
- Heading audit: one H1 in every mapped page template.
- Working-tree review: no JavaScript, CSS, layout structure, loading behavior, or functional storefront code was changed.

## Deferred recommendations

- Add or refine individual Shopify Admin SEO titles and descriptions for high-value products, collections, pages, and articles as the catalog grows. The theme now supplies safe unique fallbacks, but merchant-authored copy can target each page's exact search intent.
- Confirm the Shopify Brand settings include the preferred NoxRev organization logo. Organization schema remains valid without it, but a configured logo enriches the entity data.
- Replace the selected default sharing image in **Theme settings → SEO and social sharing** if a dedicated 1200 × 630 social creative becomes available.
- Author unique alt text for future product media in Shopify Admin. The theme falls back to the product title, but distinct media-level descriptions are better when each image shows a different angle or feature.
- Validate Product, Organization, and Breadcrumb results against the production-domain HTML with Schema.org Validator and Google Rich Results Test after deployment. Local static validation cannot confirm live catalog data supplied by Shopify or review apps.
- FAQPage schema was intentionally deferred. Google limits FAQ rich results to well-known government and health sites, and the request explicitly avoided advanced schema.
- Additional contextual links inside FAQ answers, articles, and generic page copy were deferred because they require editorial decisions and visible content changes.
