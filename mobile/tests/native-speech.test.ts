import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeReminderSpeech } from '../src/reminders/nativeSpeech';

test('native speech queues members, repeats without overlap, and cancels at dismissal/deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let active = true;
  let stops = 0;
  const spoken: { text: string; language: string; done(): void; error(error: Error): void }[] = [];
  const speech = new NativeReminderSpeech(
    {
      speak(text, options) {
        spoken.push({
          text,
          language: options.language,
          done: options.onDone,
          error: options.onError,
        });
      },
      async stop() {
        stops++;
      },
    },
    () => active,
  );
  const advance = async (ms: number) => {
    t.mock.timers.tick(ms);
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  t.after(() => speech.stop());
  speech.speak('DOLO for Mohammad Ahmad');
  speech.speak('Example medicine for Maya');
  await advance(0);
  assert.deepEqual(
    spoken.map((s) => s.text),
    ['DOLO for Mohammad Ahmad', 'Example medicine for Maya'],
  );
  await advance(10000);
  assert.equal(spoken.length, 2, 'unfinished speech must not overlap');
  spoken[0].done();
  spoken[1].done();
  await advance(5000);
  assert.equal(spoken.length, 4, 'both reminders repeat after completion');
  speech.stop();
  spoken[2].done();
  spoken[3].done();
  await advance(10000);
  assert.equal(spoken.length, 4, 'late callbacks cannot restart dismissed speech');
  assert.equal(stops, 1);
  speech.speak('Next alarm');
  await advance(0);
  const beforeDeadline = spoken.length;
  await advance(30000);
  spoken[beforeDeadline - 1].done();
  await advance(5000);
  assert.equal(spoken.length, beforeDeadline, '30-second deadline stops repetition');
  active = false;
  speech.speak('Do not speak in background');
  await advance(0);
  assert.equal(spoken.length, beforeDeadline);
  active = true;
  speech.speak('Speech failure');
  await advance(0);
  spoken[spoken.length - 1].error(new Error('No TTS voice'));
  assert.match(speech.error ?? '', /text-to-speech/);
  speech.stop();
  speech.speak('Cancelled before asynchronous start');
  speech.stop();
  const beforeCancel = spoken.length;
  await advance(0);
  assert.equal(spoken.length, beforeCancel);
  speech.setLanguage('hi-IN');
  speech.speak('आपकी दवा लेने का समय हो गया है।');
  await advance(0);
  assert.equal(spoken[spoken.length - 1].language, 'hi-IN');
});
