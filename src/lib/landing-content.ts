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
  /** The big line, e.g. "Lost 32 lbs" or "Down 4 inches, up 40 lbs on bench". */
  result: string;
  /** First name only. */
  name: string;
  /** Who they are: age, job, life situation. One short line. */
  about: string;
  beforePhoto: string;
  afterPhoto: string;
  /** Optional: how long it took, e.g. "16 weeks". */
  timeframe?: string;
};

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

  results: ClientResult[];
  /** While `results` is empty: true shows example slots, false hides the section. */
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
  contactEmail: string;
};

export const LANDING: LandingContent = {
  coachName: 'Colby Mullins',
  pageTitle: '1-on-1 Coaching · Colby Mullins',
  pageDescription:
    'Private coaching for men 25–45 who want a physique that changes how they carry themselves.',

  headline: {
    before: 'How men 25–45 build ',
    highlight: 'the physique of a main character',
    after: ', and the confidence that comes with it, without living in the gym',
  },
  subheadline:
    'Private 1-on-1 coaching. A plan built around your actual life, run by me, adjusted every week.',
  videoUrl: '',
  videoPoster: '',
  applyLabel: 'Apply now',
  applyNote: 'Takes about 2 minutes. I read every one.',

  // Real clients only. Example of one entry:
  // {
  //   result: 'Lost 32 lbs',
  //   name: 'First name',
  //   about: '38, sales director, two kids',
  //   beforePhoto: 'https://…/before.jpg',
  //   afterPhoto: 'https://…/after.jpg',
  //   timeframe: '16 weeks',
  // },
  results: [],
  showResultPlaceholders: true,

  forYou: [
    "You're 25–45 and you don't like what you see in the mirror anymore.",
    'You want to walk into a room and feel it shift, not shrink into it.',
    "You've got a career, a schedule and money to invest in getting this right.",
    'You will follow a plan when someone builds it for you and holds you to it.',
  ],
  notForYou: [
    'You want a 30-day shred and then back to normal.',
    "You're looking for the cheapest option, not the one that works.",
    "You won't send a check-in when nobody's forcing you.",
    "You want to be told it's easy. It isn't. It's simple.",
  ],

  steps: [
    {
      title: 'Apply',
      body: 'Ten quick questions. Tell me where you are and what you want to change.',
    },
    {
      title: 'Strategy call',
      body: "We get on a call. If I can help you, I'll show you exactly how. If I can't, I'll tell you.",
    },
    {
      title: 'Your plan, in the ARISE app',
      body: 'Training, food and habits built for your body and your week. Every session, every target, on your phone.',
    },
    {
      title: 'Weekly check-ins',
      body: 'You report in. I adjust. Every week, until the guy in the mirror is the one you pictured.',
    },
  ],

  about: {
    heading: "I'm Colby.",
    paragraphs: [
      "I coach men who are good at everything except taking care of themselves. Successful at work, solid with their people, and quietly unhappy with how they look and feel.",
      "I don't do cookie-cutter. Your training, your food and your habits get built around your real life, then adjusted every week based on what's actually happening.",
      'A strong body changes how you stand, how you talk and how you walk into a room. That part is the real goal.',
    ],
    photo: '',
  },

  faq: [
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
      question: 'Do I have to follow a strict diet?',
      answer:
        'No meal plan you’ll quit in two weeks. You get targets and a way of eating that fits your life, with the foods you already like. Business dinners included.',
    },
    {
      question: 'Is this for beginners?',
      answer:
        'Yes. Some clients have never trained consistently. Others have lifted for years and stopped seeing results. The plan meets you where you are.',
    },
    {
      question: 'How is this different from a program or an app?',
      answer:
        "A program can't see you. I can. Every week I look at your check-in, your training and your numbers, and change what isn't working. You talk to me, not a bot.",
    },
    {
      question: 'How much does it cost?',
      answer:
        'Coaching is a real investment, and the right plan depends on you. We go through it on the call, once I know what you need.',
    },
  ],

  finalHeadline: 'Stop waiting to feel like him.',
  finalBody:
    "Apply now. If it's a fit, you'll hear from me within 24 hours. If it isn't, I'll tell you straight.",

  instagramUrl: '',
  contactEmail: 'colbymullins24@gmail.com',
};
