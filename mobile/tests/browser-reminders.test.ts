import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlatformReminderAdapter } from '../src/reminders/adapter.web';

test('browser alerts survive audio failure and disabling stops delivery', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 100000 });
  let failAudio = false;
  let beeps = 0;
  const spoken: {
    text: string;
    voice?: { lang: string };
    onend?: () => void;
    onerror?: (event: { error: string }) => void;
  }[] = [];
  let cancelled = 0;
  let voices = [{ localService: true, lang: 'en-IN' }];
  class FakeUtterance {
    constructor(public text: string) {}
  }
  class FakeAudio {
    state = 'running';
    currentTime = 0;
    destination = {};
    async resume() {
      this.state = 'running';
    }
    async suspend() {
      this.state = 'suspended';
    }
    async close() {}
    createOscillator() {
      if (failAudio) throw new Error('Audio device unavailable');
      beeps++;
      return { frequency: { value: 0 }, connect() {}, start() {}, stop() {}, disconnect() {} };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries({
    window: {
      speechSynthesis: {
        getVoices: () => voices,
        speak: (utterance: { text: string }) => spoken.push(utterance),
        cancel: () => cancelled++,
      },
    },
    AudioContext: FakeAudio,
    SpeechSynthesisUtterance: FakeUtterance,
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globals[key];
    });
  }
  const adapter = new PlatformReminderAdapter();
  t.after(() => adapter.dispose());
  const alerts: string[] = [];
  adapter.subscribe((signal) => alerts.push(signal.key));
  await adapter.enable();
  assert.equal(beeps, 3, 'enable immediately checks sound');
  await adapter.test();
  failAudio = true;
  t.mock.timers.tick(5000);
  assert.equal(alerts.length, 1, 'audio failure must not suppress the visual alert');
  assert.equal((await adapter.inspect()).lastTriggeredAt, 105000);
  assert.match((await adapter.inspect()).audioError ?? '', /Sound could not play/);
  assert.equal((await adapter.list()).length, 0, 'dispatched alerts are removed');
  await adapter.test();
  await adapter.saveEnabled(false);
  t.mock.timers.tick(5000);
  assert.equal(alerts.length, 1, 'disabled timers do not dispatch');
  failAudio = false;
  await adapter.enable();
  adapter.speak('It is time for DOLO. Mohammad Ahmad, please take your medicine.');
  adapter.speak('It is time for Example medicine. Example member, please take your medicine.');
  t.mock.timers.tick(1000);
  assert.equal(spoken.length, 2, 'simultaneous reminders queue without replacing each other');
  assert.match(spoken[0].text, /DOLO. Mohammad Ahmad/);
  adapter.stopSound();
  assert.equal(cancelled, 1, 'dismiss stops speech');
  adapter.speak('This must not play after dismissal.');
  adapter.stopSound();
  t.mock.timers.tick(1000);
  assert.equal(spoken.length, 2);
  voices = [];
  adapter.speak('No voice available.');
  t.mock.timers.tick(1000);
  assert.match((await adapter.inspect()).speechError ?? '', /installed text-to-speech/);
  adapter.stopSound();
  voices = [{ localService: true, lang: 'en-IN' }];
  adapter.subscribe(() =>
    adapter.speak('It is time for DOLO. Mohammad Ahmad, please take your medicine.'),
  );
  await adapter.test();
  t.mock.timers.tick(5000);
  t.mock.timers.tick(1000);
  const firstRound = spoken.length;
  spoken[firstRound - 1].onend?.();
  const beepsAfterSpeech = beeps;
  t.mock.timers.tick(7500);
  t.mock.timers.tick(1000);
  assert.equal(spoken.length, firstRound + 1, 'completed speech repeats during the same alarm');
  assert.equal(beeps, beepsAfterSpeech, 'generic beeps do not replace successful speech');
  t.mock.timers.tick(10000);
  assert.equal(spoken.length, firstRound + 1, 'speech cannot overlap an unfinished utterance');
  spoken[spoken.length - 1].onend?.();
  adapter.stopSound();
  t.mock.timers.tick(10000);
  assert.equal(spoken.length, firstRound + 1, 'dismiss cancels future speech repetitions');
  voices = [
    { localService: true, lang: 'en-IN' },
    { localService: true, lang: 'hi-IN' },
  ];
  await adapter.setLanguage('hi-IN');
  assert.equal((await adapter.inspect()).speechVoice, 'hi-IN');
  adapter.speak('आपकी दवा DOLO लेने का समय हो गया है।');
  t.mock.timers.tick(1000);
  assert.equal(spoken[spoken.length - 1].voice?.lang, 'hi-IN');
  adapter.stopSound();
  voices = [{ localService: true, lang: 'en-IN' }];
  assert.equal((await adapter.inspect()).speechVoice, undefined);
  assert.deepEqual((await adapter.inspect()).localSpeechLanguages, ['en-IN']);
  const beforeMissingHindi = spoken.length;
  adapter.speak('कृपया अपनी दवा लें।');
  t.mock.timers.tick(1000);
  assert.equal(
    spoken.length,
    beforeMissingHindi,
    'missing Hindi voice must not silently use English',
  );
  assert.match((await adapter.inspect()).speechError ?? '', /Hindi/);
  let statusChanges = 0;
  const unsubscribeStatus = adapter.subscribeStatus(() => statusChanges++);
  adapter.testSpeech();
  assert.ok(
    statusChanges > 0,
    'speech failure is reported immediately, without waiting for the next schedule refresh',
  );
  voices = [{ localService: true, lang: 'hi_IN' }];
  const beforeDirectTest = spoken.length;
  adapter.testSpeech();
  assert.equal(
    spoken.length,
    beforeDirectTest + 1,
    'direct test speaks in the user click without a timer',
  );
  assert.equal(spoken[spoken.length - 1].voice?.lang, 'hi_IN');
  assert.match(spoken[spoken.length - 1].text, /परीक्षण/);
  spoken[spoken.length - 1].onerror?.({ error: 'not-allowed' });
  assert.match((await adapter.inspect()).speechError ?? '', /Chrome blocked speech/);
  unsubscribeStatus();
});
