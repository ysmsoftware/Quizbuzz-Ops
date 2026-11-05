import { SubscriptionPlan } from '@prisma/client';

const count = (n: number) => n.toLocaleString('en-IN');

/** What a plan gives, in the words shown on the plan picker and the checkout page. One list for both. */
export function planFeatureList(p: SubscriptionPlan): string[] {
  const features: string[] = [];
  features.push(p.maxContestsPerCycle !== null ? `${count(p.maxContestsPerCycle)} contest${p.maxContestsPerCycle === 1 ? '' : 's'} per month` : 'Unlimited contests');
  if (p.maxCandidatesPerMonth !== null) features.push(`${count(p.maxCandidatesPerMonth)} candidates per month`);
  features.push(p.maxParticipantsPerContest !== null ? `Up to ${count(p.maxParticipantsPerContest)} participants per contest` : 'Unlimited participants');
  features.push(p.maxQuestionsPerContest !== null ? `Up to ${count(p.maxQuestionsPerContest)} questions per contest` : 'Unlimited questions');
  if (p.maxLearners === null) features.push('Unlimited learners');
  else if (p.maxLearners > 0) features.push(`Up to ${count(p.maxLearners)} learners`);
  if (p.maxOrgMembers !== null && p.maxOrgMembers > 1) features.push(`${p.maxOrgMembers} team members`);
  // ponytail: AI credits aren't listed until AI generation ships, so nobody pays for something they can't use yet.
  if (p.featureProctoring) features.push('Webcam proctoring');
  if (p.featureLearnerGroups) features.push('Learner groups');
  if (p.featureGradebook) features.push('Gradebook');
  if (p.featureCertBranding) features.push('Your own certificate design');
  if (p.featureAnalyticsExport) features.push('CSV export');
  if (p.featureAmbassadorCampaigns) features.push('Ambassador campaigns');
  if (p.featureCustomDomain) features.push('Custom domain');
  if (p.featurePrioritySupport) features.push('Priority support');
  return features;
}
