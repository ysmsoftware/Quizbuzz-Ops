import { PricingConfig, BookingPricingBreakdown } from '@/lib/types';

export function calculateBookingEstimate(
  params: {
    durationMinutes: number;
    questionCount: number;
    participantCount: number;
    addOnsSelected: {
      proctoring: boolean;
      certificates: boolean;
      prioritySupport: boolean;
    };
  },
  config: PricingConfig
): BookingPricingBreakdown & { instances: number } {
  const baseFee = config.baseBookingFee;

  // Instance calculation
  const instances = Math.ceil(params.participantCount / (config.participantsPerInstance || 1));
  const hours = params.durationMinutes / 60;
  const computeCost = instances * hours * config.perInstanceHourCost;

  // Cache cost
  const cacheCost = config.elastiCachePerDayCost;

  // Question cost
  const questionCost = params.questionCount * config.perQuestionCost;

  // Addons cost
  let addOnsCost = 0;
  if (params.addOnsSelected.proctoring) {
    addOnsCost += config.addOns.proctoring.flatCost;
  }
  if (params.addOnsSelected.certificates) {
    addOnsCost += params.participantCount * config.addOns.certificates.perParticipantCost;
  }
  if (params.addOnsSelected.prioritySupport) {
    addOnsCost += config.addOns.prioritySupport.flatCost;
  }

  const subtotal = baseFee + computeCost + cacheCost + questionCost + addOnsCost;
  const margin = subtotal * (config.marginMultiplier - 1);
  const total = subtotal * config.marginMultiplier;

  return {
    baseFee,
    computeCost: Math.round(computeCost * 100) / 100,
    cacheCost,
    questionCost: Math.round(questionCost * 100) / 100,
    addOnsCost: Math.round(addOnsCost * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    total: Math.round(total * 100) / 100,
    instances,
  };
}
