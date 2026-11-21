const beat = 640, nod = 390;
export const crowLessonDemoMs = 1200;
export const crowLessonAnswerMs = 8000;

// The camera bird cannot nod back in view. A story or a call owns its actor
// until the gesture finishes; the lesson never moves a bird or changes its role.
function available(bird, flock) {
  const age = (flock.allBirds[0].elapsed ?? 0) - (bird.musicReplyAt ?? -Infinity);
  return bird.id !== 0 && !bird.storyPose && !bird.gazePose && !bird.encounterPose && !bird.prankPose && !bird.flightPose
    && bird.id !== flock.beacons?.sender.id && bird.id !== flock.beacons?.recipient.id
    && (age < -.50 || age > .45);
}

export function crowAuthorityPulse(bird, now = performance.now()) {
  const signal = bird.authoritySignal;
  if (!signal) return 0;
  const age = now - signal.start;
  if (age < 0 || age >= (signal.count - 1) * beat + nod) return 0;
  const stroke = age % beat;
  return stroke < nod ? Math.sin(Math.PI * stroke / nod) ** 2 : 0;
}

export function createCrowAuthority(flock) {
  let teacher, demo, readyAt = 0, lastTap;
  function cancel() {
    if (teacher && teacher.authoritySignal === demo) delete teacher.authoritySignal;
    teacher = demo = lastTap = null;
  }
  function teach(bird, now) {
    cancel();
    if (!available(bird, flock)) return false;
    teacher = bird;
    demo = bird.authoritySignal = {start:now + 100, count:2};
    readyAt = now + crowLessonDemoMs;
    return true;
  }
  function answer(now, receivedAt = now) {
    if (!teacher || now > readyAt + crowLessonAnswerMs || !available(teacher, flock)) {
      cancel();
      return 'expired';
    }
    if (now < readyAt) return 'watch';
    if (lastTap === null || now - lastTap > 2600) {
      lastTap = now;
      return 'once';
    }
    if (now - lastTap < 220) return 'once';

    const teacherNow = teacher;
    cancel();
    const distance = bird => Math.hypot(bird.x - teacherNow.x, bird.y - teacherNow.y, bird.z - teacherNow.z);
    const audience = flock.allBirds.filter(bird => available(bird, flock) && distance(bird) <= 35);
    audience.sort((a, b) => distance(a) - distance(b) || a.id - b.id);
    audience.forEach((bird, i) => { bird.authoritySignal = {start:receivedAt + 90 + i * 115, count:1}; });
    return audience.length > 1 ? 'flock' : 'alone';
  }
  return {teach, answer, cancel};
}
