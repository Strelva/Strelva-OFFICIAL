"use client";

import { useState } from "react";

const logoUrl =
  "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/1e4a45f8-08e2-4d8c-bfab-93d0b32cb9b9/pink+png.png?format=300w";

const images = {
  heroPrimary:
    "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/4ff5da44-9ebd-4579-987b-28ba0a3a4038/IMG_6833.jpeg?format=1500w",
  heroSecondary:
    "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/3205166a-4504-458d-bc7f-441ed6325d67/IMG_6214.jpeg?format=1000w",
  founder:
    "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/bef22895-3f3a-42a5-bc3e-53d4e8e90bb7/IMG_0531.jpg?format=750w",
  workshop:
    "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/9bbc311d-7a2a-4d6a-932e-14a522dcb696/View+recent+photos.png?format=1500w",
};

const services = [
  {
    name: "Brand Styling",
    price: "$150",
    image:
      "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/126bf085-5f71-4e75-9a96-0cdddb6de091/View+recent+photos+11.png?format=750w",
    description:
      "Fashion concepts for social media, marketing campaigns, product shoots, and lookbooks.",
  },
  {
    name: "Editorial Styling",
    price: "$300",
    image:
      "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/8bdbb5a8-4f26-4103-ae30-b50c7fd472a0/IMG_5968.jpeg?format=750w",
    description:
      "Wardrobe styling, shoot coordination, and fashion-forward concepts for photoshoots or publications.",
  },
  {
    name: "Closet Clean Out & Organizational Styling",
    shortName: "Closet Clean Out",
    price: "$350",
    image:
      "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/7083e31c-095e-4a3f-816c-dca3e054e2f2/33+Best+Closet+Organization+Ideas+to+Maximize+Space+and+Style++Architectural+Digest++Architectural+Digest.png?format=750w",
    description:
      "Wardrobe editing, outfit planning, seasonal organization, and a simpler everyday getting-dressed flow.",
  },
  {
    name: "Creative Direction Services",
    shortName: "Creative Direction",
    price: "$500",
    image:
      "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/8267d5fb-e9d4-4dff-9148-2c508264c7a4/mn2026+mag+cover+copy.jpg?format=750w",
    description:
      "Mood boards, campaign concepts, styling guidance, on-set direction, and visual storytelling support.",
  },
];

const portfolioImages = [
  "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/51bd827d-8e02-40d4-9e54-e2852038f3f7/7A6A3659.jpg?format=750w",
  "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/6d832e9e-775e-4828-a410-4a3c4d9cb1af/7A6A3943.jpg?format=750w",
  "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/c82593f1-a9a3-4375-be95-00e014d727f2/7A6A4057.jpg?format=750w",
  "https://images.squarespace-cdn.com/content/v1/69de48afd2d7e94acdf8bda0/bbe1d183-8d32-4877-ac43-72f13519de4a/Screenshot+2026-05-08+at+11.16.10+AM.png?format=750w",
];

const faqs = [
  {
    question: "What services does StyledByJadaMarie offer?",
    answer:
      "Personal styling, closet organization, outfit curation, event styling, photoshoot styling, creative direction, and brand styling.",
  },
  {
    question: "Who are these services for?",
    answer:
      "Anyone looking to elevate personal style, organize a wardrobe, build confidence through fashion, or create a stronger visual identity.",
  },
  {
    question: "Do I need a consultation first?",
    answer:
      "Yes. Consultations make sure every styling experience is personalized and aligned with your lifestyle, aesthetic, goals, and needs.",
  },
  {
    question: "Can we style pieces I already own?",
    answer:
      "Yes. A major part of the process is helping clients rediscover and style existing pieces into fresh outfit combinations.",
  },
];

export function JadaIveySite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(services[0].name);
  const [notes, setNotes] = useState("");
  const [bookingStatus, setBookingStatus] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState("");

  function inquire(serviceName: string) {
    setSelectedService(serviceName);
    setNotes(`I am interested in ${serviceName}.`);
    document.querySelector("#consultation")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="jada-site">
      <header className={`jada-header ${menuOpen ? "is-open" : ""}`}>
        <a className="jada-brand" href="#top" aria-label="By Jada Ivey home">
          <img src={logoUrl} alt="" />
          <span>By Jada Ivey</span>
        </a>
        <button
          className="jada-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="jada-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <nav id="jada-nav" className="jada-nav" aria-label="Primary navigation">
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <a href="#portfolio" onClick={() => setMenuOpen(false)}>Styling Portfolio</a>
          <a href="#services" onClick={() => setMenuOpen(false)}>Services</a>
          <a href="#consultation" onClick={() => setMenuOpen(false)}>Consultation</a>
        </nav>
      </header>

      <main id="top">
        <section className="jada-section jada-hero">
          <div className="jada-copy">
            <p className="jada-label">New York and Buffalo styling studio</p>
            <h1>Wardrobe Stylist, Creative Director & Upcyclist</h1>
            <p>
              StyledByJadaMarie helps individuals, brands, and creatives build a
              stronger visual identity through personal styling, wardrobe curation,
              editorial concepts, and intentional creative direction.
            </p>
            <div className="jada-button-row">
              <a className="jada-button jada-button-primary" href="#consultation">Book a Consultation</a>
              <a className="jada-button jada-button-secondary" href="#portfolio">View Portfolio</a>
            </div>
          </div>
          <div className="jada-hero-media" aria-label="Fashion styling editorial preview">
            <figure className="jada-frame jada-frame-large">
              <img src={images.heroPrimary} alt="Styled editorial portrait" />
            </figure>
            <figure className="jada-frame jada-frame-small">
              <img src={images.heroSecondary} alt="Styled fashion detail" />
            </figure>
            <div className="jada-note">
              <strong>716 Styled</strong>
              <span>Real people, real style, real transformations.</span>
            </div>
          </div>
        </section>

        <section id="about" className="jada-band">
          <div className="jada-section-grid">
            <div>
              <p className="jada-label">About StyledByJadaMarie</p>
              <h2>Identity through style, built with intention.</h2>
            </div>
            <div className="jada-prose">
              <p>
                StyledByJadaMarie is a styling and creative direction brand focused on
                helping individuals, brands, and creatives develop a strong visual
                identity through fashion.
              </p>
              <p>
                Founded by Jada Ivey, the brand blends fashion, culture, and creativity
                to create looks and experiences that feel authentic, impactful, and
                visually memorable.
              </p>
            </div>
          </div>
          <div className="jada-quote-row">
            <blockquote>
              The house of StyledByJadaMarie markets identity through style, making
              getting dressed feel powerful, personal, and unforgettable.
            </blockquote>
            <div className="jada-founder-card">
              <img src={images.founder} alt="Jada Ivey" />
              <div>
                <h3>Meet the Founder</h3>
                <p>
                  Hi, I am Jada Ivey, the founder of StyledByJadaMarie. I created
                  this brand from my passion for fashion, creativity, and helping
                  people feel confident through personal style.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="jada-section jada-workshop">
          <div className="jada-copy">
            <p className="jada-label">Personal styling and wardrobe curation workshop</p>
            <h2>Styled with intention pt2</h2>
            <p>
              Styled With Intention PT2 is back with elevated workshops, new
              stylists, hands-on sessions, creative networking, and real styling
              insight.
            </p>
            <dl className="jada-event-details">
              <div><dt>Date</dt><dd>July 18th</dd></div>
              <div><dt>Location</dt><dd>Buffalo, NY</dd></div>
              <div><dt>Time</dt><dd>TBD</dd></div>
            </dl>
            <a className="jada-button jada-button-primary" href="#consultation">Save My Spot</a>
          </div>
          <div className="jada-workshop-poster">
            <img src={images.workshop} alt="Styled with intention workshop visual" />
          </div>
        </section>

        <section id="services" className="jada-band">
          <div className="jada-heading">
            <p className="jada-label">Services</p>
            <h2>Styling support for personal wardrobes, brands, shoots, and creative projects.</h2>
          </div>
          <div className="jada-service-grid">
            {services.map((service) => (
              <article className="jada-service-card" key={service.name}>
                <img src={service.image} alt={service.shortName || service.name} />
                <div>
                  <span>{service.price}</span>
                  <h3>{service.shortName || service.name}</h3>
                  <p>{service.description}</p>
                  <button type="button" onClick={() => inquire(service.name)}>Inquire</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="portfolio" className="jada-section">
          <div className="jada-heading">
            <p className="jada-label">Styling Portfolio</p>
            <h2>Editorial looks, campaign direction, and styled moments with a clear point of view.</h2>
          </div>
          <div className="jada-portfolio-grid" aria-label="Portfolio image gallery">
            {portfolioImages.map((src, index) => (
              <img key={src} src={src} alt={`Styling portfolio ${index + 1}`} />
            ))}
          </div>
        </section>

        <section className="jada-band">
          <div className="jada-section-grid">
            <div>
              <p className="jada-label">Frequently Asked Questions</p>
              <h2>Start with the service, then shape the styling plan around the person.</h2>
            </div>
            <div className="jada-faq-list">
              {faqs.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="consultation" className="jada-section jada-consultation">
          <div className="jada-copy">
            <p className="jada-label">Consultation</p>
            <h2>Let us create something that stands out.</h2>
            <p>
              Share the service you are considering, the occasion or project, and the
              kind of style direction you want to build.
            </p>
            <div className="jada-contact-list">
              <a href="mailto:stylesbyjadamarie@yahoo.com">stylesbyjadamarie@yahoo.com</a>
              <a href="tel:+17165628086">716-562-8086</a>
              <span>New York, New York</span>
            </div>
          </div>
          <form
            className="jada-booking-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBookingStatus("Thanks. Your inquiry is ready to connect to email or checkout.");
            }}
          >
            <label>Name<input type="text" name="name" autoComplete="name" required /></label>
            <label>Email<input type="email" name="email" autoComplete="email" required /></label>
            <label>
              Service
              <select value={selectedService} onChange={(event) => setSelectedService(event.target.value)}>
                {services.map((service) => (
                  <option key={service.name}>{service.name}</option>
                ))}
                <option>Workshop: Styled with intention pt2</option>
              </select>
            </label>
            <label>
              Project notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                name="message"
                rows={5}
                placeholder="Tell Jada what you are building, wearing, or planning."
              />
            </label>
            <button className="jada-button jada-button-primary" type="submit">Send Inquiry</button>
            <p className="jada-status" role="status" aria-live="polite">{bookingStatus}</p>
          </form>
        </section>

        <section className="jada-newsletter">
          <div>
            <p className="jada-label">Subscribe to our blog</p>
            <h2>Stay in the loop with 716 Styled.</h2>
            <p>Get exclusive updates, behind-the-scenes styling, and early access to features.</p>
          </div>
          <form
            className="jada-newsletter-form"
            onSubmit={(event) => {
              event.preventDefault();
              setNewsletterStatus("You are officially tapped in. 716 Styled updates will land here first.");
            }}
          >
            <label className="jada-sr-only" htmlFor="jada-newsletter-email">Email</label>
            <input id="jada-newsletter-email" type="email" placeholder="Email address" required />
            <button type="submit">Subscribe</button>
            <p className="jada-status" role="status" aria-live="polite">{newsletterStatus}</p>
          </form>
        </section>
      </main>

      <footer className="jada-footer">
        <div>
          <strong>By Jada Ivey</strong>
          <p>Personal styling, wardrobe curation, brand styling, and creative direction.</p>
        </div>
        <div className="jada-footer-links">
          <a href="https://www.instagram.com/styled_byjadamarie/">Instagram</a>
          <a href="https://www.linkedin.com/in/jada-ivey-545b532a1/">LinkedIn</a>
          <a href="https://www.tiktok.com/@styledbyjadamarie?_r=1&_t=ZP-96B92AhpNzb">TikTok</a>
        </div>
      </footer>
    </div>
  );
}
