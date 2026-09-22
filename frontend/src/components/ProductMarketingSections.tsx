import type { ProductMarketingContent } from '@/types';
import { parseEmbedVideo, resolveImageUrl } from '@/lib/utils';

type ImageSection = NonNullable<ProductMarketingContent['image_sections']>[number];

function cleanLines(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

export function ProductMarketingSections({ content, productName }: { content: ProductMarketingContent; productName: string }) {
  const video = content.video_url || content.videoUrl || content.video || '';
  const embed = parseEmbedVideo(video);
  const gallery = cleanLines(content.gallery);
  const uses = cleanLines(content.uses);
  const benefits = cleanLines(content.benefits);
  const advantages = cleanLines(content.advantages);
  const faqs = Array.isArray(content.faqs)
    ? content.faqs.filter((faq) => faq && faq.question?.trim() && faq.answer?.trim())
    : [];
  const imageSections = Array.isArray(content.image_sections) ? content.image_sections : Array.isArray(content.sections) ? content.sections : [];

  if (!video && !gallery.length && !uses.length && !benefits.length && !advantages.length && !faqs.length && !imageSections.length) return null;

  return (
    <div className="pv-story">
      {video && (
        <section className="pv-story__video" aria-labelledby="pv-story-video-heading">
          <div className="pv-story__heading">
            <span>Discover the story</span>
            <h2 id="pv-story-video-heading">See what makes {productName} special</h2>
          </div>
          <div className="pv-story__player">
            {embed ? (
              <iframe src={embed} title={`${productName} video`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            ) : (
              <video src={resolveImageUrl(video)} controls preload="metadata" playsInline aria-label={`${productName} video`} />
            )}
          </div>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="pv-story__section" aria-labelledby="pv-story-gallery-heading">
          <div className="pv-story__heading"><span>A closer look</span><h2 id="pv-story-gallery-heading">Explore {productName}</h2></div>
          <div className="pv-story__gallery">
            {gallery.map((src, index) => <img key={`${src}-${index}`} src={resolveImageUrl(src)} alt={`${productName} detail ${index + 1}`} loading="lazy" />)}
          </div>
        </section>
      )}

      {imageSections.length > 0 && (
        <section className="pv-story__images" aria-label={`${productName} images`}>
          {imageSections.map((section: ImageSection, index: number) => (
            <div className="pv-story__image-group" key={index}>
              {section.landscape && <img className="pv-story__landscape" src={resolveImageUrl(section.landscape)} alt={`${productName} story ${index + 1}`} loading="lazy" />}
              {(section.portrait_1 || section.portrait_2) && (
                <div className="pv-story__portrait-pair">
                  {section.portrait_1 && <img src={resolveImageUrl(section.portrait_1)} alt={`${productName} detail`} loading="lazy" />}
                  {section.portrait_2 && <img src={resolveImageUrl(section.portrait_2)} alt={`${productName} detail`} loading="lazy" />}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {uses.length > 0 && (
        <section className="pv-story__section pv-story__uses" aria-labelledby="pv-story-uses-heading">
          <div className="pv-story__heading"><span>Everyday ideas</span><h2 id="pv-story-uses-heading">Ways to use it</h2></div>
          <div className="pv-story__card-grid">
            {uses.map((use, index) => <article className="pv-story__card" key={`${use}-${index}`}><span className="pv-story__number">{String(index + 1).padStart(2, '0')}</span><p>{use}</p></article>)}
          </div>
        </section>
      )}

      {benefits.length > 0 && (
        <section className="pv-story__section pv-story__benefits" aria-labelledby="pv-story-benefits-heading">
          <div className="pv-story__heading"><span>Why choose it</span><h2 id="pv-story-benefits-heading">Benefits</h2></div>
          <div className="pv-story__card-grid">
            {benefits.map((benefit, index) => <article className="pv-story__card" key={`${benefit}-${index}`}><i className="ph ph-check-circle" aria-hidden="true" /><p>{benefit}</p></article>)}
          </div>
        </section>
      )}

      {advantages.length > 0 && (
        <section className="pv-story__section pv-story__advantages" aria-labelledby="pv-story-advantages-heading">
          <div className="pv-story__heading"><span>Made with care</span><h2 id="pv-story-advantages-heading">The Gawdee advantage</h2></div>
          <div className="pv-story__card-grid">
            {advantages.map((advantage, index) => <article className="pv-story__card" key={`${advantage}-${index}`}><i className="ph ph-seal-check" aria-hidden="true" /><p>{advantage}</p></article>)}
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="pv-story__section pv-story__faq" aria-labelledby="pv-story-faq-heading">
          <div className="pv-story__heading"><span>You ask, we answer</span><h2 id="pv-story-faq-heading">Frequently asked questions</h2></div>
          <div className="pv-story__faq-list">
            {faqs.map((faq, index) => <details key={`${faq.question}-${index}`}><summary>{faq.question}<i className="ph ph-plus" aria-hidden="true" /></summary><p>{faq.answer}</p></details>)}
          </div>
        </section>
      )}
    </div>
  );
}
