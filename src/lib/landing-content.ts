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
    'Private 1-on-1 coaching for successful men 28–50. Get lean enough to see your abs, then keep them for life while still eating the food you love.',

  headline: {
    before: 'How successful men 28–50 get lean enough to ',
    highlight: 'see their six-pack',
    after: ', and keep it for life, without giving up the food they love',
  },
  subheadline:
    'Private 1-on-1 coaching with me. We get you in the best shape of your life, then I teach you how to stay there while you still have dessert, drinks and dinners out.',
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
  results: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ photo: `/results/result-${n}.jpg` })),

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
    "You're 28–50, you've built a real career, and you're done with your body being the one thing that hasn't caught up.",
    'You want to see your abs. Not someday. For real, and for good.',
    "You don't want to live on chicken and rice. You want to get shredded and still have the steak dinner, the drinks and the dessert.",
    "You have the money to invest in doing this right, and you'll do the work when someone builds the plan and holds you to it.",
  ],
  notForYou: [
    'You want a 12-week crash diet and then back to how you were.',
    "You're looking for the cheapest option, not the one that works.",
    "You won't send a check-in when nobody's forcing you.",
    "You want to be told it's easy. It isn't. It's simple.",
  ],

  steps: [
    {
      title: 'Apply',
      body: 'A few quick questions. Tell me where you are and what you want to change.',
    },
    {
      title: 'Strategy call',
      body: "We get on a call. If I can help you, I'll show you exactly how. If I can't, I'll tell you.",
    },
    {
      title: 'Get lean, in the ARISE app',
      body: 'Training and nutrition built around your week, your travel and the food you actually eat. Every session and every target, right on your phone.',
    },
    {
      title: 'Learn to keep it for life',
      body: "Weekly check-ins with me. I adjust everything as you go, and I teach you how to eat out, drink and enjoy dessert without losing what you built. So you never have to start over again.",
    },
  ],

  about: {
    heading: "I'm Colby.",
    paragraphs: [
      "I coach men who are great at everything except taking care of themselves. Crushing it at work, solid with their people, and quietly sick of how they look with their shirt off.",
      "Most coaches get you lean with a strict meal plan. It works for 12 weeks, then real life shows up and it all comes back. I do it differently. You get lean eating the foods you love, so by the time you see your abs you already know how to keep them.",
      'The six-pack is the goal. Walking into any room, any restaurant and any vacation feeling like that guy, for the rest of your life, is the real win.',
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
        'Most clients train 3–5 times a week, 45–75 minutes a session. Your plan is built around the time you actually have, not the time you wish you had.',
    },
    {
      question: 'Do I need a gym?',
      answer:
        'A gym gets you there fastest, but it isn’t required. If you train at home or travel a lot, the plan is built around the equipment you have.',
    },
    {
      question: "I'm in my 40s. Is it too late to get abs?",
      answer:
        "No. Plenty of men get in the best shape of their life after 40. It takes a plan built for where your body is now, and someone adjusting it every week. That's my job.",
    },
    {
      question: 'How is this different from a program or an app?',
      answer:
        "A program can't see you. I can. Every week I look at your check-in, your training and your numbers, and change what isn't working. You talk to me, not a bot.",
    },
    {
      question: 'How much does it cost?',
      answer:
        "This is premium 1-on-1 coaching and it's a real investment. We go through it on the call, once I know exactly what you need.",
    },
  ],

  finalHeadline: 'See your abs. Keep them for life.',
  finalBody:
    "Apply now. If it's a fit, you'll hear from me within 24 hours. If it isn't, I'll tell you straight.",

  instagramUrl: 'https://www.instagram.com/colby.mullinss/',
  calendlyUrl: 'https://calendly.com/colbymullins24/new-meeting',
  contactEmail: 'colbymullins24@gmail.com',
};
