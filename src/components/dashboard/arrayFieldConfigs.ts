export interface ArrayFieldDef {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "url"
    | "tel"
    | "select"
    | "toggle"
    | "date"
    | "image"
    | "object-array";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  /** For type: "object-array" — schema of each nested row. */
  itemFields?: ArrayFieldDef[];
}

export interface ArraySectionConfig {
  sectionKey: string;
  arrayKey: string;
  nameKey: string;
  detailKey: string;
  label: string;
  addLabel: string;
  fields: ArrayFieldDef[];
  defaultItem: () => Record<string, unknown>;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const ARRAY_CONFIGS: Record<string, ArraySectionConfig> = {
  services: {
    sectionKey: "services",
    arrayKey: "services",
    nameKey: "name",
    detailKey: "price",
    label: "Your services",
    addLabel: "Add service",
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "Service name", required: true },
      { key: "description", label: "Description", type: "textarea", placeholder: "What this service includes..." },
      { key: "duration", label: "Duration", type: "text", placeholder: "60 min" },
      { key: "price", label: "Price", type: "text", placeholder: "120" },
      { key: "who_its_for", label: "Who It's For", type: "text", placeholder: "Anyone looking to..." },
      { key: "booking_link", label: "Booking Link", type: "url", placeholder: "https://example.com/book" },
      { key: "featured", label: "Featured", type: "toggle" },
      { key: "comingSoon", label: "Coming Soon", type: "toggle" },
    ],
    defaultItem: () => ({
      id: uid(),
      name: "",
      description: "",
      duration: "",
      price: "",
      featured: false,
      who_its_for: "",
      booking_link: "",
      comingSoon: false,
      image_url: "",
    }),
  },

  testimonials: {
    sectionKey: "testimonials",
    arrayKey: "testimonials",
    nameKey: "author",
    detailKey: "quote",
    label: "Client reviews",
    addLabel: "Add review",
    fields: [
      { key: "author", label: "Author", type: "text", placeholder: "Client name", required: true },
      { key: "quote", label: "Quote", type: "textarea", placeholder: "What they said...", required: true },
      { key: "location", label: "Location", type: "text", placeholder: "City, ST" },
    ],
    defaultItem: () => ({
      id: uid(),
      quote: "",
      author: "",
      location: "",
    }),
  },

  events: {
    sectionKey: "events",
    arrayKey: "events",
    nameKey: "title",
    detailKey: "date",
    label: "Events & classes",
    addLabel: "Add event",
    fields: [
      { key: "title", label: "Title", type: "text", placeholder: "Event name", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "time", label: "Time", type: "text", placeholder: "6:00 PM" },
      { key: "location", label: "Location", type: "text", placeholder: "Studio, Room 2" },
      { key: "description", label: "Description", type: "textarea", placeholder: "What to expect..." },
      {
        key: "hosted_by",
        label: "Hosted By",
        type: "select",
        options: [
          { value: "owner", label: "Owner" },
          { value: "partner", label: "Partner" },
          { value: "community", label: "Community" },
        ],
      },
      { key: "external_link", label: "Link", type: "url", placeholder: "https://..." },
    ],
    defaultItem: () => ({
      id: uid(),
      title: "",
      date: "",
      time: "",
      location: "",
      description: "",
      hosted_by: "owner",
      external_link: "",
      image_url: "",
    }),
  },

  providers: {
    sectionKey: "providers",
    arrayKey: "providers",
    nameKey: "name",
    detailKey: "service",
    label: "Recommended providers",
    addLabel: "Add provider",
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "Provider name", required: true },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          { value: "general", label: "General" },
          { value: "specialty", label: "Specialty" },
          { value: "partner", label: "Partner" },
          { value: "referral", label: "Referral" },
        ],
      },
      { key: "service", label: "Service", type: "text", placeholder: "What they offer" },
      { key: "why_i_recommend", label: "Why I Recommend", type: "textarea", placeholder: "I love working with..." },
      { key: "booking_link", label: "Booking Link", type: "url", placeholder: "https://example.com/book" },
      { key: "phone", label: "Phone", type: "tel", placeholder: "(716) 555-0000" },
      { key: "photo_url", label: "Photo", type: "image" },
    ],
    defaultItem: () => ({
      id: uid(),
      name: "",
      category: "specialty",
      service: "",
      why_i_recommend: "",
      booking_link: "",
      phone: "",
      photo_url: "",
    }),
  },

  faq: {
    sectionKey: "faq",
    arrayKey: "faqs",
    nameKey: "question",
    detailKey: "answer",
    label: "Questions & answers",
    addLabel: "Add question",
    fields: [
      { key: "question", label: "Question", type: "text", placeholder: "What do clients ask?", required: true },
      { key: "answer", label: "Answer", type: "textarea", placeholder: "Your answer..." },
    ],
    defaultItem: () => ({
      id: uid(),
      question: "",
      answer: "",
    }),
  },

  products: {
    sectionKey: "products",
    arrayKey: "products",
    nameKey: "name",
    detailKey: "price",
    label: "Your products",
    addLabel: "Add product",
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "Product name", required: true },
      { key: "description", label: "Description", type: "textarea", placeholder: "What makes it special..." },
      { key: "ingredients", label: "Ingredients", type: "text", placeholder: "Apples, Cinnamon, Maple" },
      { key: "price", label: "Price", type: "text", placeholder: "5.99" },
      { key: "badge", label: "Badge", type: "text", placeholder: "BESTSELLER" },
      { key: "stripePaymentLink", label: "Payment link", type: "url", placeholder: "https://buy.stripe.com/..." },
      { key: "imageUrl", label: "Photo", type: "image" },
      { key: "featured", label: "Featured", type: "toggle" },
      { key: "comingSoon", label: "Coming Soon", type: "toggle" },
    ],
    defaultItem: () => ({
      id: uid(),
      name: "",
      description: "",
      ingredients: "",
      price: "",
      badge: "",
      stripePaymentLink: "",
      imageUrl: "",
      featured: false,
      comingSoon: false,
    }),
  },

  shop: {
    sectionKey: "shop",
    arrayKey: "items",
    nameKey: "name",
    detailKey: "price",
    label: "Products",
    addLabel: "Add product",
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "Product name", required: true },
      { key: "description", label: "Description", type: "textarea", placeholder: "What is it..." },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: [
          { value: "recommended", label: "Recommended" },
          { value: "merch", label: "Merch" },
          { value: "tools", label: "Tools" },
        ],
      },
      { key: "price", label: "Price", type: "text", placeholder: "29.99" },
      { key: "external_link", label: "Link", type: "url", placeholder: "https://..." },
    ],
    defaultItem: () => ({
      id: uid(),
      name: "",
      description: "",
      category: "recommended",
      price: "",
      external_link: "",
      image_url: "",
    }),
  },
};
