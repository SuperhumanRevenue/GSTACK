import type {
  ResponseHandlerInput,
  YesResponseAssets,
  MaybeResponseAssets,
  NoResponseAssets,
} from './types.js';

/**
 * Pure function: Generate response assets for a "yes" response.
 * Produces: intro email template, AE first response, champion thank-you.
 */
export function handleYesResponse(input: ResponseHandlerInput): YesResponseAssets {
  const { championName, championCompany, targetContact, targetTitle, targetCompany, triggerEvent, owningAe, aeTitle } = input;

  const introEmailTemplate = `Hi ${targetContact},

I wanted to introduce you to ${owningAe}${aeTitle ? ` (${aeTitle})` : ''} — they work with companies like ${championCompany} on ${triggerEvent.toLowerCase().includes('usage') ? 'scaling their operations' : 'solving challenges similar to what we tackled'}.

Given what I've seen firsthand, I thought it'd be worth a quick conversation. I'll let ${owningAe} share more context.

Best,
${championName}`;

  const aeFirstResponse = `Hi ${targetContact},

Thanks so much for connecting — ${championName} speaks incredibly highly of the work you're doing at ${targetCompany}.

I'd love to learn more about your current priorities and see if there's a fit. Would you have 20 minutes this week or next for a quick chat?

Best,
${owningAe}`;

  const championThankYou = `${championName},

Thank you for making the introduction to ${targetContact} at ${targetCompany}. This means a lot, and I'll make sure to represent your recommendation well.

As a thank you, I'd love to [reciprocal offer — e.g., feature you in our upcoming case study / invite you to our executive roundtable / give your team early access to our new feature].

I'll keep you posted on how the conversation goes.

Grateful,
${owningAe}`;

  return { introEmailTemplate, aeFirstResponse, championThankYou };
}

/**
 * Pure function: Generate response assets for a "maybe" response.
 * Produces: day 5 follow-up, day 12 final nudge, friction remover (pre-drafted intro).
 */
export function handleMaybeResponse(input: ResponseHandlerInput): MaybeResponseAssets {
  const { championName, targetContact, targetTitle, targetCompany, context, owningAe } = input;

  const day5Followup = `Hi ${championName},

Circling back on the introduction to ${targetContact} at ${targetCompany}. I completely understand if the timing isn't right — just wanted to mention that I went ahead and drafted a quick intro email you could forward. It's below if you'd like to take a look.

No pressure at all — happy to revisit this anytime.

Best,
${owningAe}`;

  const day12FinalNudge = `Hi ${championName},

Last note on this — I don't want to be a pest! If connecting with ${targetContact} at ${targetCompany} isn't the right move right now, totally understood. If you'd prefer, I could also just share some results content with them directly and mention you as a reference instead.

Either way, thank you for considering it.

${owningAe}`;

  const frictionRemover = `Hi ${targetContact},

${championName} suggested I reach out — they mentioned that the challenges at ${targetCompany} sounded similar to what they tackled at ${input.championCompany}.

Would you be open to a brief call to see if there's a fit? I promise to keep it focused and valuable.

Best,
${owningAe}

---
[Note: This is a pre-drafted intro for ${championName} to forward. ${championName} can personalize before sending.]`;

  return { day5Followup, day12FinalNudge, frictionRemover };
}

/**
 * Pure function: Generate response assets for a "no" response.
 * Produces: graceful close + alternative ask (case study offer).
 */
export function handleNoResponse(input: ResponseHandlerInput): NoResponseAssets {
  const { championName, championCompany, owningAe } = input;

  const gracefulClose = `${championName},

Completely understand — appreciate you considering it. Your partnership with us at ${championCompany} is what matters most, and I never want a referral ask to feel like an obligation.

If anything changes down the road, or if someone in your network ever mentions they're looking for what we do, I'm always here.

Thank you,
${owningAe}`;

  const alternativeAsk = `One other thought, ${championName} — would you be open to being featured in a case study instead? Your results at ${championCompany} are genuinely impressive, and sharing your story could help others facing similar challenges.

No names or specifics would be shared without your full approval. Just a thought — and completely optional.

${owningAe}`;

  return { gracefulClose, alternativeAsk };
}

/**
 * Pure function: Route a response to the correct handler.
 */
export function routeResponse(input: ResponseHandlerInput): {
  type: 'yes' | 'maybe' | 'no';
  assets: YesResponseAssets | MaybeResponseAssets | NoResponseAssets;
} {
  switch (input.response) {
    case 'yes':
      return { type: 'yes', assets: handleYesResponse(input) };
    case 'maybe':
      return { type: 'maybe', assets: handleMaybeResponse(input) };
    case 'no':
      return { type: 'no', assets: handleNoResponse(input) };
  }
}
