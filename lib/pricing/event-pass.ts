/**
 * The Event Pass price (docs/pricing/01-tier-sheet.md, "Event Pass calculator"). The one place this
 * formula lives: the ops calculator and bookings use it here, and the landing page asks
 * /api/v1/billing-portal/event-pass/quote, so the two can never disagree.
 */

/** Participants → base price, linear between these, then rounded up to the next ₹…99. */
const ANCHORS: Array<[number, number]> = [
  [100, 1499], [500, 4999], [1000, 8999], [2500, 19999], [5000, 34999], [10000, 59999], [25000, 124999],
];
export const EVENT_PASS_MAX_PARTICIPANTS = 25000;
const EXTRA_CONTEST_SHARE = 0.25;
const AI_PER_100_QUESTIONS = 499;
const WHATSAPP_PER_PARTICIPANT = 0.3;
const ENGINEER_ON_THE_DAY = 4999;
const GST = 0.18;
const GATEWAY_FEE = 0.02;
export const DEFAULT_REVENUE_SHARE_PERCENT = 15;
const MIN_SHARE_PER_REGISTRATION = 5;
/** Up to this many, Solo's monthly plan covers it more cheaply. */
const SOLO_PARTICIPANT_LIMIT = 250;

export interface EventPassInput {
  participants: number;
  extraContests?: number;
  aiQuestionsHundreds?: number;
  whatsapp?: boolean;
  engineer?: boolean;
  /** Charging participants an entry fee: shows revenue share and the break-even. */
  entryFee?: number | null;
  revenueSharePercent?: number;
}

export interface EventPassQuote {
  participants: number;
  basePrice: number;
  extraContestsPrice: number;
  aiQuestionsPrice: number;
  whatsappPrice: number;
  engineerPrice: number;
  /** Before GST: what a booking charges. */
  price: number;
  gst: number;
  total: number;
  perHead: number;
  /** Over 25,000 participants we quote by hand. */
  talkToUs: boolean;
  soloIsCheaper: boolean;
  revenueShare: null | {
    percent: number;
    netPerRegistration: number;
    sharePerRegistration: number;
    payoutPerRegistration: number;
    estimatedShare: number;
    /** Above this many registrations, paying upfront is cheaper. */
    breakEvenRegistrations: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rounds up to the next number ending in 99. */
export function upTo99(n: number): number {
  return Math.ceil((n - 99) / 100) * 100 + 99;
}

export function eventPassBasePrice(participants: number): number {
  const p = Math.max(1, Math.min(participants, EVENT_PASS_MAX_PARTICIPANTS));
  if (p <= ANCHORS[0][0]) return ANCHORS[0][1];
  for (let i = 1; i < ANCHORS.length; i++) {
    const [p1, price1] = ANCHORS[i];
    if (p <= p1) {
      const [p0, price0] = ANCHORS[i - 1];
      return upTo99(price0 + ((p - p0) / (p1 - p0)) * (price1 - price0));
    }
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

export function eventPassQuote(input: EventPassInput): EventPassQuote {
  const participants = Math.max(1, Math.round(input.participants));
  const basePrice = eventPassBasePrice(participants);
  const extraContestsPrice = round2(basePrice * EXTRA_CONTEST_SHARE * Math.max(0, Math.min(5, input.extraContests ?? 0)));
  const aiQuestionsPrice = Math.max(0, input.aiQuestionsHundreds ?? 0) * AI_PER_100_QUESTIONS;
  const whatsappPrice = input.whatsapp ? round2(participants * WHATSAPP_PER_PARTICIPANT) : 0;
  const engineerPrice = input.engineer ? ENGINEER_ON_THE_DAY : 0;
  const price = round2(basePrice + extraContestsPrice + aiQuestionsPrice + whatsappPrice + engineerPrice);
  const gst = round2(price * GST);

  let revenueShare: EventPassQuote['revenueShare'] = null;
  if (input.entryFee && input.entryFee > 0) {
    const percent = input.revenueSharePercent ?? DEFAULT_REVENUE_SHARE_PERCENT;
    const gateway = input.entryFee * GATEWAY_FEE;
    const net = input.entryFee - gateway - gateway * GST;
    // Our share includes its own GST (tier sheet recommendation): one number is easier to sell.
    const share = Math.max(net * (percent / 100), MIN_SHARE_PER_REGISTRATION);
    revenueShare = {
      percent,
      netPerRegistration: round2(net),
      sharePerRegistration: round2(share),
      payoutPerRegistration: round2(net - share),
      estimatedShare: round2(share * participants),
      breakEvenRegistrations: Math.ceil(price / share),
    };
  }

  return {
    participants,
    basePrice,
    extraContestsPrice,
    aiQuestionsPrice,
    whatsappPrice,
    engineerPrice,
    price,
    gst,
    total: round2(price + gst),
    perHead: round2(price / participants),
    talkToUs: input.participants > EVENT_PASS_MAX_PARTICIPANTS,
    soloIsCheaper: participants <= SOLO_PARTICIPANT_LIMIT,
    revenueShare,
  };
}
