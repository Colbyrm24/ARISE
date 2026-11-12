/*
  ============================================================================
  EVERYTHING ON THE /coaching PAGE THAT YOU'D EVER WANT TO CHANGE LIVES HERE.
  ============================================================================

  Edit the text between the quotes and save. Nothing else needs touching.

  - Photos and video: paste a full https:// link. Upload the file anywhere
    that gives you a public link (Supabase storage, YouTube, Vimeo, your
    Shopify files), or drop it in the /public folder and use "/your-file.jpg".
  - Leave a link as '' (empty quotes) and the page shows a placeholder in
    its place instead of breaking.
  - Results: only ever add REAL clients, with their permission. While the
    list is empty the page shows clearly-marked example slots — flip
    `showResultPlaceholders` to false to hide the whole section instead.
*/

export type HeadlineParts = {
  /** Text before the highlighted phrase. */
  before: string;
  /** The phrase that lights up in the accent colour. */
  highlight: string;
  /** Text after it. */
  after: string;
};

export type ClientResult = {
  /** The big line, e.g. "Lost 32 lbs" or "Down 4 inches, up 40 lbs on bench". Optional. */
  result?: string;
  /** First name only. Optional. */
  name?: string;
  /** Who they are: age, job, life situation. One short line. Optional. */
  about?: string;
  /** One side-by-side before/after image (how most transformations are saved). */
  photo?: string;
  /** Or two separate photos. */
  beforePhoto?: string;
  afterPhoto?: string;
  /** Optional: how long it took, e.g. "16 weeks". */
  timeframe?: string;
};

export type Testimonial = {
  /** What they said, in their words. One to three sentences. */
  quote: string;
  /** First name only. */
  name: string;
  /** Age, job, life situation. One short line. */
  about: string;
  /** Optional: a YouTube, Vimeo or .mp4 link to them saying it on camera. */
  videoUrl?: string;
};

/** A short proof line under the hero, e.g. { value: '800+', label: 'men coached' }. */
export type ProofStat = { value: string; label: string };

export type Step = { title: string; body: string };
export type Faq = { question: string; answer: string };

export type LandingContent = {
  coachName: string;
  /** Shown in the browser tab and when the link is shared. */
  pageTitle: string;
  pageDescription: string;

  headline: HeadlineParts;
  subheadline: string;
  /** YouTube, Vimeo, or a direct .mp4 link. '' shows the placeholder frame. */
  videoUrl: string;
  /** Optional still shown before an .mp4 loads. */
  videoPoster: string;
  applyLabel: string;
  /** The small line under the Apply button. */
  applyNote: string;

  /** Up to three short proof lines under the hero. Only true numbers. */
  proof: ProofStat[];

  results: ClientResult[];
  /** In their own words. Real clients only, with their permission. */
  testimonials: Testimonial[];
  /** While `results` (and `testimonials`) is empty: true shows example slots, false hides the section. */
  showResultPlaceholders: boolean;

  forYou: string[];
  notForYou: string[];

  steps: Step[];

  about: {
    heading: string;
    /** One paragraph per string. */
    paragraphs: string[];
    photo: string;
  };

  faq: Faq[];

  finalHeadline: string;
  finalBody: string;

  /** Full link to your Instagram, shown after someone applies. '' hides it. */
  instagramUrl: string;
  /** Your Calendly link. Applicants who are a fit book a call here the moment they finish. */
  calendlyUrl: string;
  contactEmail: string;
};

export const LANDING: LandingContent = {
  coachName: 'Colby Mullins',
  pageTitle: '1-on-1 Coaching · Colby Mullins',
  pageDescription:
    'Private 1-on-1 coaching for men 30+. Get your six-pack while still eating the foods you love, and keep it for life.',

  headline: {
    before: 'How men 30+ get their ',
    highlight: 'six-pack',
    after: ' while still eating the foods they love',
  },
  subheadline:
    'Private 1-on-1 coaching with me. I get you in the best shape of your life, then I teach you how to stay there while you still have dessert, drinks and dinners out.',
  videoUrl: 'https://www.youtube.com/watch?v=1PnVesMmLto',
  videoPoster: '',
  applyLabel: 'Apply now',
  applyNote: 'Takes about 2 minutes. I read every one myself.',

  // Real clients only. Example of one entry:
  // {
  //   result: 'Lost 32 lbs',
  //   name: 'First name',
  //   about: '41, owns a roofing company, two kids',
  //   beforePhoto: 'https://…/before.jpg',
  //   afterPhoto: 'https://…/after.jpg',
  //   timeframe: '16 weeks',
  // },
  // Straight from your Instagram bio. Change or remove if a number changes.
  proof: [
    { value: '800+', label: 'clients coached' },
    { value: '1-on-1', label: 'with me, not an app' },
    { value: '6 months', label: 'lean, then keep it' },
  ],

  // Real client transformations. Add a name, result line and "about" to any
  // of these when you have them — e.g. result: 'Lost 32 lbs', name: 'Mike',
  // about: '44, owns a roofing company'.
  results: [1, 2, 3, 10, 11, 4, 12, 5, 6, 7, 8, 9].map((n) => ({ photo: `/results/result-${n}.jpg` })),

  // Real clients only. Example of one entry:
  // {
  //   quote: "I've had abs for a year now and I still have a beer with the guys every Friday.",
  //   name: 'First name',
  //   about: '38, sales director, two kids',
  //   videoUrl: 'https://youtube.com/…',   // optional
  // },
  testimonials: [],
  showResultPlaceholders: false,

  forYou: [
    "You're 25–50, you've built a real career, and you're done with your body being the one thing that hasn't caught up.",
    'You want to see your abs. Not someday. For real, and for good.',
    "You don't want to live on chicken and rice. You want to get shredded and still have the steak dinner, the drinks and the dessert.",
    "You want someone hands-on with you every step of the way, not someone who sells you a course and leaves you to figure it out.",
  ],
  notForYou: [
    'You want a 12-week crash diet and then back to how you were.',
    "You're looking for the cheapest option, not the one that works.",
    "You won't send a check-in when nobody's forcing you.",
    "You want to be told it's easy. It isn't. It's simple.",
  ],

  // "What you get" — the offer, not the process. The call covers the rest.
  steps: [
    {
      title: 'Me, every single day',
      body: "Text me whenever. I check in with you every day, and if you need a call, I jump on one. No team, no assistant. Just me.",
    },
    {
      title: '3 workouts a week, 30 minutes each',
      body: "That's all it takes to build real muscle. Every session is in your app with a video showing exactly how to do each move.",
    },
    {
      title: 'Eat the foods you love',
      body: "Your meals are built around what you already like to eat. Snap a photo of your plate and the numbers are done for you.",
    },
    {
      title: 'Abs you keep for life',
      body: "I teach you how to eat out, have a drink and enjoy dessert without losing what you built. So you never have to start over again.",
    },
  ],

  about: {
    heading: "I'm Colby.",
    paragraphs: [
      "I help guys see their abs for the first time while building muscle at the same time. And you don't have to live some strict, miserable life to get there.",
      "You still go out to eat. You still have a drink with the boys and dessert with your family. You still have time for your kids, your wife and your business. Your life doesn't stop because you're getting in shape.",
      "After the first month, things start happening faster than you'd ever imagine. Most of my guys never look back, because once it's set up, everything just runs.",
    ],
    photo: '/colby.jpg',
  },

  faq: [
    {
      question: 'Can I really still drink and eat out?',
      answer:
        "Yes. That's the whole point. Restaurants, drinks, dessert, even fast food. I teach you how to fit them in so you get lean and stay lean, instead of white-knuckling a meal plan until you quit.",
    },
    {
      question: 'How much time does this take each week?',
      answer:
        "Three days a week, about 30 minutes a session. That's all it takes to build the most muscle you can. Most people get this wrong and think more hours in the gym means more results. It doesn't. Short, hard, focused sessions do.",
    },
    {
      question: 'Do I need a gym?',
      answer:
        'A gym gets you there fastest, but it isn’t required. If you train at home or travel a lot, the plan is built around the equipment you have.',
    },
    {
      question: "I'm in my 40s. Is it too late to get abs?",
      answer:
        "No. Plenty of men get in the best shape of their life after 40. It takes a plan built for where your body is now, and someone adjusting it every day. That's my job.",
    },
    {
      question: 'How is this different from a program or an app?',
      answer:
        "A program can't see you. I can. I talk with you every single day, and whenever you need a call, I'm on it. There's no team and no assistant coach. It's just me and you, one on one, until you hit your goal. There's no way you fail.",
    },
    {
      question: 'How much does it cost?',
      answer:
        "This is premium 1-on-1 coaching and it's a real investment. I'll go through it with you on the call, once I know exactly what you need.",
    },
  ],

  finalHeadline: 'See your abs. Keep them for life.',
  finalBody:
    "Apply now. If it's a fit, you'll hear from me within 24 hours.",

  instagramUrl: 'https://www.instagram.com/colby.mullinss/',
  calendlyUrl: 'https://calendly.com/colbymullins24/new-meeting',
  contactEmail: 'colbymullins24@gmail.com',
};
