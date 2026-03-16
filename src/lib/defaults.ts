import type {
  HeroContent,
  ServicesContent,
  StoryContent,
  TestimonialsContent,
  EventsContent,
  ProvidersContent,
  ContactContent,
  SiteSettings,
  ContentMap,
} from "./types";

export const defaultHero: HeroContent = {
  headline: "Move Better.\nFeel Better.\nLive Better.",
  subheadline: "Assisted Stretching in Williamsville, NY",
  tagline: "Personalized assisted stretching sessions that promote relaxation, restore mobility, and support your overall well-being.",
  ctaText: "Book a Session",
  ctaLink: "#booking",
  backgroundImageUrl:
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=2400&h=1600&fit=crop&q=90",
};

export const defaultServices: ServicesContent = {
  sectionLabel: "Services",
  headline: "What We Offer",
  description:
    "Every assisted stretch session is thoughtfully tailored to each individual. You don't have to be an athlete or have a chronic condition to benefit.",
  services: [
    {
      id: "flexibility-foundation",
      name: "Flexibility Foundation",
      description:
        "Required for new clients. This 90-minute session begins with an in-depth discussion of your medical history — past or current injuries, medications, sleep hygiene, and stress levels — along with your mobility goals. Followed by a full-body, hands-on assisted stretching and mobility assessment. You'll receive personalized recommendations for future sessions and curated product suggestions to support your well-being.",
      duration: "90 min",
      price: "85",
      featured: true,
      who_its_for: "New clients or those who haven't visited in over a year",
      vagaro_link: "https://www.vagaro.com/rohlaxwellness",
      comingSoon: false,
    },
    {
      id: "prenatal-foundation",
      name: "Prenatal Flexibility Foundation",
      description:
        "Required for new pregnant clients. This 90-minute session covers your medical history, pregnancy-specific considerations, and mobility goals. Followed by a full-body assisted stretching assessment using supportive positioning aides for comfort and safety throughout.",
      duration: "90 min",
      price: "85",
      featured: false,
      who_its_for: "New pregnant clients seeking safe, supported stretching",
      vagaro_link: "https://www.vagaro.com/rohlaxwellness",
      comingSoon: false,
    },
    {
      id: "stretch-360",
      name: "Stretch 360",
      description:
        "Full-body assisted stretching targeting all major muscle groups. You'll move comfortably between back and stomach positioning as we work through each area. Concludes with a heating pad and deep-tissue massage gun for optimal relaxation.",
      duration: "60 min",
      price: "60",
      featured: false,
      who_its_for: "Returning clients wanting comprehensive full-body stretching",
      vagaro_link: "https://www.vagaro.com/rohlaxwellness",
      comingSoon: false,
    },
    {
      id: "spinal-sequence",
      name: "Spinal Sequence",
      description:
        "Focused on the neck, mid-back, and low back. Perfect for anyone who spends long hours sitting at a desk or experiencing back stiffness. Concludes with a heating pad and deep-tissue massage gun.",
      duration: "60 min",
      price: "60",
      featured: false,
      who_its_for: "Desk workers and anyone with back stiffness or tension",
      vagaro_link: "https://www.vagaro.com/rohlaxwellness",
      comingSoon: false,
    },
    {
      id: "upper-body",
      name: "Upper Body Focused Stretch",
      description:
        "Targeting the neck, mid-back, shoulders, shoulder blades, forearms, wrists, and hands. Concludes with a heating pad and deep-tissue massage gun for enhanced relaxation.",
      duration: "60 min",
      price: "60",
      featured: false,
      who_its_for: "Those carrying tension in shoulders, neck, or arms",
      vagaro_link: "https://www.vagaro.com/rohlaxwellness",
      comingSoon: false,
    },
    {
      id: "lower-body",
      name: "Lower Body Focused Stretch",
      description:
        "Targeting the low back, hips, knees, and ankles. Positioning includes back, stomach, and sides for comfort and optimal access. Concludes with a heating pad and deep-tissue massage gun.",
      duration: "60 min",
      price: "60",
      featured: false,
      who_its_for: "Runners, athletes, and anyone with hip or leg tightness",
      vagaro_link: "https://www.vagaro.com/rohlaxwellness",
      comingSoon: false,
    },
    {
      id: "prenatal-stretch",
      name: "Prenatal Stretch",
      description:
        "A fully customized 60-minute session designed around mom's needs that day. We gently target key areas of tension with safe, pregnancy-supported techniques and positioning aides. Heating pad and massage gun use based entirely on your preference.",
      duration: "60 min",
      price: "60",
      featured: false,
      who_its_for: "Expecting mothers at any stage of pregnancy",
      vagaro_link: "https://www.vagaro.com/rohlaxwellness",
      comingSoon: false,
    },
  ],
};

export const defaultStory: StoryContent = {
  sectionLabel: "About Chelsea",
  headline: "Your body\ndeserves better.",
  accentText: "Buffalo native, physical therapist, wellness advocate",
  statement:
    "I started Rohlax because I believe everyone deserves to move freely and feel good in their body.",
  paragraphs: [
    "I'm a physical therapist with nearly a decade of healthcare experience across various clinical settings. After experiencing burnout — made worse by COVID's impact on healthcare — I took a step back and asked myself what kind of care I really wanted to provide.",
    "That's when I found assisted stretching. It was the professional pivot I needed — a way to create personalized 1:1 connections with clients while helping them feel calm, relaxed, and truly heard about their physical symptoms.",
    "At Rohlax Wellness, every session is tailored to your body. Whether you're an athlete, a desk worker, a new parent, or just someone who wants to feel better — you don't have to have a chronic condition to benefit. I'm here to help you move better, feel better, and live better.",
  ],
  stats: [
    { value: "10+", label: "Years in Healthcare" },
    { value: "1:1", label: "Personalized Sessions" },
  ],
  quote: "Your presence is your power.",
  quoteAttribution: "Chelsea Rohl, Founder",
  imageUrl:
    "https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=1200&h=1600&fit=crop",
  secondaryImageUrl: "",
};

export const defaultTestimonials: TestimonialsContent = {
  sectionLabel: "Testimonials",
  headline: "What Clients Are Saying",
  testimonials: [
    {
      id: "t1",
      quote:
        "Chelsea truly works wonders. I left my first full-body stretch session feeling amazing — my body hasn't felt this good in years.",
      author: "Vagaro Client",
      location: "",
    },
    {
      id: "t2",
      quote:
        "Chelsea was extremely professional, thorough, and focused on my key pain points. She explained everything extremely well without pushing anything.",
      author: "Vagaro Client",
      location: "",
    },
    {
      id: "t3",
      quote:
        "Through many years in sports, Chelsea provided the most proficient and effective upper-body stretch I've ever had, by far.",
      author: "Vagaro Client",
      location: "",
    },
    {
      id: "t4",
      quote:
        "Had my first stretch postpartum and Chelsea really targeted the tense areas to work toward better mobility. Highly recommend!",
      author: "Vagaro Client",
      location: "",
    },
  ],
};

export const defaultEvents: EventsContent = {
  sectionLabel: "Events",
  headline: "Upcoming Events",
  events: [
    {
      id: "e1",
      title: "Private Rohlax Restorative Yoga",
      date: "2026-03-15",
      time: "7:00 PM",
      location: "Vibe Yoga Lab",
      description: "A private restorative yoga session hosted by Rohlax Wellness at Vibe Yoga Lab. Limited spots available.",
      hosted_by: "chelsea",
      external_link: "https://www.eventbrite.com",
    },
    {
      id: "e2",
      title: "Move Through Motherhood Series",
      date: "2026-03-20",
      time: "",
      location: "Vital Roots Chiropractic WNY",
      description: "A movement series designed for mothers at every stage. Stretch, strengthen, and restore with expert guidance.",
      hosted_by: "partner",
      external_link: "https://vitalrootschiropracticwny.janeapp.com",
    },
    {
      id: "e3",
      title: "Let Go to Grow — Yoga Event",
      date: "2026-03-28",
      time: "",
      location: "Hope and Healing Wellness Services",
      description: "Release what no longer serves you in this guided yoga and stretching event focused on growth and renewal.",
      hosted_by: "community",
      external_link: "https://hopeandhealingwellnessservices.com/letgotogrow",
    },
    {
      id: "e4",
      title: "Saving Butts Pilates",
      date: "2026-03-28",
      time: "",
      location: "",
      description: "A fun pilates event supporting a great cause. Get moving, have fun, and give back to the community.",
      hosted_by: "community",
      external_link: "https://www.eventbrite.com",
    },
    {
      id: "e5",
      title: "Beauty Boost Buffalo",
      date: "2026-04-15",
      time: "",
      location: "Buffalo, NY",
      description: "Supporting women-owned businesses in WNY. Rohlax Wellness will be there — come say hi and learn about assisted stretching.",
      hosted_by: "community",
      external_link: "https://www.thebeautyboost.net/buffalo",
    },
  ],
};

export const defaultProviders: ProvidersContent = {
  sectionLabel: "Trusted Providers",
  headline: "My Wellness Network",
  description:
    "I partner with and recommend these incredible local practitioners. When you need care beyond stretching, these are the people I trust with my own clients.",
  providers: [
    {
      id: "p-trent",
      name: "Trent, LMT",
      category: "massage",
      service: "Licensed Massage Therapy",
      why_i_recommend: "Incredible hands and deep knowledge of muscular anatomy. My go-to for massage referrals.",
      booking_link: "https://nickelcitywellnesswny.com",
      phone: "",
      photo_url: "",
    },
    {
      id: "p-recoverlab",
      name: "RecoverLab Performance Chiropractic",
      category: "chiropractic",
      service: "Performance Chiropractic",
      why_i_recommend: "Sports-focused chiropractic care that complements stretching perfectly. Great for athletes and active clients.",
      booking_link: "https://recoverlabbuffalo.com",
      phone: "",
      photo_url: "",
    },
    {
      id: "p-abby",
      name: "Dr. Abby Borkowski",
      category: "chiropractic",
      service: "Chiropractic & Functional Medicine",
      why_i_recommend: "Combines chiropractic with functional medicine for a whole-body approach. Fantastic for chronic issues.",
      booking_link: "https://thrivemedicalwny.com/abby-borkowski-dc",
      phone: "",
      photo_url: "",
    },
    {
      id: "p-revival",
      name: "Revival Chiropractic & Wellness",
      category: "chiropractic",
      service: "Chiropractic Care",
      why_i_recommend: "Wonderful wellness-focused chiropractic practice. Great energy and excellent care.",
      booking_link: "https://revivalchirobuf.janeapp.com",
      phone: "",
      photo_url: "",
    },
    {
      id: "p-vibe",
      name: "Vibe Yoga Lab",
      category: "yoga",
      service: "Yoga Classes & Events",
      why_i_recommend: "Beautiful studio with incredible instructors. The perfect complement to assisted stretching.",
      booking_link: "https://vibeyogalab.com",
      phone: "",
      photo_url: "",
    },
    {
      id: "p-revamp",
      name: "Revamp",
      category: "fitness",
      service: "Personal Training & Massage",
      why_i_recommend: "Combines personal training with massage therapy. A one-stop shop for strength and recovery.",
      booking_link: "https://revamp-hq.com",
      phone: "",
      photo_url: "",
    },
    {
      id: "p-enrgi",
      name: "ENRGI Fitness Studio",
      category: "fitness",
      service: "Fitness Studio",
      why_i_recommend: "High-energy fitness classes that build the strength side of your wellness routine.",
      booking_link: "https://enrgifitnessstudio.com",
      phone: "",
      photo_url: "",
    },
    {
      id: "p-soul",
      name: "Soul Healing Center",
      category: "specialty",
      service: "Holistic Wellness Space",
      why_i_recommend: "A truly holistic approach to wellness. Wonderful for anyone looking to heal mind, body, and spirit.",
      booking_link: "https://shapiroholistichealth.com",
      phone: "",
      photo_url: "",
    },
  ],
};

export const defaultContact: ContactContent = {
  email: "rohlaxwellness@gmail.com",
  phone: "(716) 559-2282",
  address: "7158 Transit Road, Williamsville, NY 14221",
  hours: "Tuesday: 12:00 PM – 6:00 PM\nWednesday: 10:00 AM – 4:00 PM\nThursday: 12:00 PM – 6:00 PM\nFriday: 10:00 AM – 4:00 PM\nSaturday–Monday: Closed",
  locationTitle: "Williamsville,\nNew York",
  locationDescription: "Located inside Bel Viso Skin Studio, 2nd floor. Free parking available behind the building at 7158 Transit Rd.",
  instagramUrl: "https://instagram.com/rohlaxwellness",
  facebookUrl: "https://facebook.com/rohlaxwellness",
  googleMapsUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2920.5!2d-78.7!3d42.97!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDLCsDU4JzEyLjAiTiA3OMKwNDInMDAuMCJX!5e0!3m2!1sen!2sus!4v1!5m2!1sen!2sus",
};

export const defaultSettings: SiteSettings = {
  siteName: "Rohlax Wellness",
  siteTagline: "Assisted Stretching in Williamsville, NY",
  siteDescription:
    "Professional assisted stretching in Williamsville, NY. Personalized 1-on-1 sessions to relieve tension, improve mobility, and support your well-being. Book with Chelsea Rohl today.",
  footerTagline: "Move Better. Feel Better. Live Better.",
  copyrightText: "Rohlax Wellness",
  vagaroUrl: "https://www.vagaro.com/rohlaxwellness",
};

export const defaults: ContentMap = {
  hero: defaultHero,
  services: defaultServices,
  story: defaultStory,
  testimonials: defaultTestimonials,
  events: defaultEvents,
  providers: defaultProviders,
  contact: defaultContact,
  settings: defaultSettings,
};
