// The spacing between three brief glints identifies the intended pair.
const phrases = [[.04,.27,.69],[.04,.46,.70],[.04,.28,.86],[.04,.51,.86]];
export const CROW_BEACON_DURATION = 1.10;

export function crowBeaconCode(senderId,recipientId,episode) {
  return (senderId*3+recipientId+episode)%phrases.length;
}

export function crowBeaconPulse(code,secondsSinceStart) {
  if (secondsSinceStart<=0 || secondsSinceStart>=CROW_BEACON_DURATION) return 0;
  for (const start of phrases[code]) {
    const progress=(secondsSinceStart-start)/.20;
    if (progress>0 && progress<1) return Math.sin(Math.PI*progress)**2;
  }
  return 0;
}
