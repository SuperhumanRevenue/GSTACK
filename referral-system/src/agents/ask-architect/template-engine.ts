import type { AcvRange, CommunicationStyle } from '../../shared/types.js';
import type { ComposeInput } from './types.js';

/**
 * Pure function: Generate the live ask script for in-person/call delivery.
 */
export function composeLiveAsk(input: ComposeInput): { script: string; keyMechanics: string[] } {
  const { championName, targetContact, targetTitle, targetCompany, triggerEvent, resultsToReference, connectionPath, communicationStyle } = input;

  const opening = communicationStyle === 'casual'
    ? `Hey ${championName}, I've been thinking about something.`
    : `${championName}, I wanted to share something with you.`;

  const valueAnchor = `The results you've driven — ${resultsToReference} — are exactly the kind of story that resonates with other leaders facing similar challenges.`;

  const specificAsk = `I noticed you're connected with ${targetContact}, ${targetTitle} at ${targetCompany}. ${describeConnectionNaturally(connectionPath)} Given what you've accomplished, I think ${targetContact} would genuinely benefit from hearing your perspective.`;

  const close = communicationStyle === 'casual'
    ? `Would you be open to a quick intro? I can draft something you can tweak and send — takes 30 seconds.`
    : `Would you be willing to make an introduction? I'd be happy to draft the email for you to review and personalize.`;

  const script = [opening, '', valueAnchor, '', specificAsk, '', close].join('\n');

  return {
    script,
    keyMechanics: [
      'Anchor on value delivered before asking',
      'Name the specific person (not "anyone you know")',
      'Offer to draft the intro (remove friction)',
      'Give them an easy yes — review and send, not compose from scratch',
    ],
  };
}

/**
 * Pure function: Generate the async ask (email/Slack) — under 100 words.
 */
export function composeAsyncAsk(input: ComposeInput): { subject: string; body: string; keyMechanics: string[] } {
  const { championName, targetContact, targetTitle, targetCompany, triggerEvent, resultsToReference, communicationStyle } = input;

  const subject = communicationStyle === 'casual'
    ? `Quick thought — ${targetContact} at ${targetCompany}`
    : `Introduction to ${targetContact} at ${targetCompany}`;

  const greeting = communicationStyle === 'casual' ? `Hi ${championName},` : `Dear ${championName},`;

  const body = `${greeting}

Thinking about ${triggerEvent} and the results you've seen (${resultsToReference}), I believe ${targetContact} (${targetTitle} at ${targetCompany}) would find your perspective really valuable.

Would you be open to a quick intro? I've drafted something below you can tweak and send — should take under a minute.

Thanks for considering it.`;

  return {
    subject,
    body,
    keyMechanics: [
      'Subject line names the specific person',
      'Under 100 words',
      'Reference trigger event and results',
      'Pre-drafted intro offer (friction remover)',
    ],
  };
}

/**
 * Pure function: Generate the soft seed — plants the idea without a direct ask.
 */
export function composeSoftSeed(input: ComposeInput): { message: string; keyMechanics: string[] } {
  const { championName, targetContact, targetCompany, resultsToReference, communicationStyle } = input;

  const message = communicationStyle === 'casual'
    ? `By the way ${championName}, I was looking at what you've accomplished (${resultsToReference}) and it reminded me of challenges I hear from folks like ${targetContact} at ${targetCompany}. Your story would really resonate. Something to think about — no ask, just planting a seed.`
    : `${championName}, as I reflected on your results (${resultsToReference}), I thought of ${targetContact} at ${targetCompany} — they're tackling similar challenges. Your experience would be valuable to them. Just wanted to plant that thought.`;

  return {
    message,
    keyMechanics: [
      'No direct ask — seeds the idea for a future conversation',
      'References results to establish credibility',
      'Names the specific target to make it concrete',
      'Low pressure — "just planting a seed"',
    ],
  };
}

/**
 * Pure function: Recommend which ask version to use based on context.
 */
export function recommendVersion(input: {
  relationshipStrength: string;
  communicationStyle: CommunicationStyle;
  triggerRecency: 'recent' | 'moderate' | 'old';
  hasUpcomingMeeting: boolean;
}): { version: 'live' | 'async' | 'soft_seed'; reason: string } {
  const { relationshipStrength, communicationStyle, triggerRecency, hasUpcomingMeeting } = input;

  // Live ask: strong relationship + upcoming meeting + recent trigger
  if (relationshipStrength === 'strong' && hasUpcomingMeeting && triggerRecency === 'recent') {
    return {
      version: 'live',
      reason: 'Strong relationship with upcoming meeting and recent trigger — perfect for a live conversation.',
    };
  }

  // Soft seed: cold relationship or old trigger
  if (relationshipStrength === 'cold' || triggerRecency === 'old') {
    return {
      version: 'soft_seed',
      reason: 'Relationship or timing not ideal for a direct ask — plant the seed for a future conversation.',
    };
  }

  // Async: default for warm relationships
  return {
    version: 'async',
    reason: 'Good relationship and timing for an async ask — gives champion time to consider without pressure.',
  };
}

// ─── Helpers ───

function describeConnectionNaturally(connectionPath: string): string {
  if (connectionPath.includes('former colleague') || connectionPath.includes('previously worked')) {
    return 'Given your shared history,';
  }
  if (connectionPath.includes('community') || connectionPath.includes('communities')) {
    return 'Since you\'re in the same professional circles,';
  }
  return '';
}
