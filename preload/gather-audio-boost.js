// Quiet-audio boost for Gather, injected into the page's main world.
//
// Incoming audio is sent through a compressor and makeup gain, so quiet voices get louder,
// and then through a limiter that holds peaks at full scale, so the loudest audio stays as loud as before.
// Two playback paths are covered:
//   - <audio>/<video> elements playing a MediaStream (WebRTC voices): the element is silenced
//     and its stream is played through Web Audio instead, honouring the page's volume/muted values.
//   - Web Audio graphs the page builds itself: connections to ctx.destination go through the chain.
//
// This function is serialized by contextBridge.executeInMainWorld, so it must be self-contained.
function installAudioBoost(initialLevel, presets) {
  const KEY = Symbol.for('gather-audio-boost');
  if (window[KEY]) return;

  const origConnect = AudioNode.prototype.connect;
  const origDisconnect = AudioNode.prototype.disconnect;

  let level = presets[initialLevel] ? initialLevel : 'off';
  const chains = new Map(); // AudioContext -> chain

  function wire(chain) {
    const preset = presets[level];
    origDisconnect.call(chain.input);
    origDisconnect.call(chain.compressor);
    origDisconnect.call(chain.makeup);
    origDisconnect.call(chain.limiter);

    if (!preset) {
      origConnect.call(chain.input, chain.ctx.destination);
      return;
    }

    chain.compressor.threshold.value = preset.threshold;
    chain.compressor.ratio.value = preset.ratio;
    chain.makeup.gain.value = Math.pow(10, preset.makeupDb / 20);

    origConnect.call(chain.input, chain.compressor);
    origConnect.call(chain.compressor, chain.makeup);
    origConnect.call(chain.makeup, chain.limiter);
    origConnect.call(chain.limiter, chain.ctx.destination);
  }

  function getChain(ctx) {
    let chain = chains.get(ctx);
    if (chain) return chain;

    const compressor = ctx.createDynamicsCompressor();
    compressor.knee.value = 12;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;

    // Brick-wall style limiter: keeps the boosted signal at or below the original maximum
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;

    chain = { ctx, input: ctx.createGain(), compressor, makeup: ctx.createGain(), limiter };
    chains.set(ctx, chain);
    wire(chain);
    return chain;
  }

  // Page-built Web Audio graphs: redirect connections to the destination into the boost chain
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode && target.context instanceof AudioContext) {
      return origConnect.call(this, getChain(target.context).input, ...rest);
    }
    return origConnect.call(this, target, ...rest);
  };

  AudioNode.prototype.disconnect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode && chains.has(target.context)) {
      return origDisconnect.call(this, chains.get(target.context).input, ...rest);
    }
    return origDisconnect.apply(this, arguments);
  };

  // Media elements playing a MediaStream: play the stream through our own context instead
  let elementCtx = null;
  function getElementCtx() {
    if (!elementCtx || elementCtx.state === 'closed') elementCtx = new AudioContext();
    if (elementCtx.state === 'suspended') elementCtx.resume().catch(() => {});
    return elementCtx;
  }

  const desc = (name) => Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, name);
  const srcObjectDesc = desc('srcObject');
  const volumeDesc = desc('volume');
  const mutedDesc = desc('muted');
  const routed = new WeakMap(); // element -> { stream, source, gain, volume, muted }

  function updateElementGain(el) {
    const r = routed.get(el);
    if (!r) return;
    r.gain.gain.value = r.muted || el.paused ? 0 : r.volume;
  }

  function unroute(el) {
    const r = routed.get(el);
    if (!r) return;
    if (r.source) origDisconnect.call(r.source);
    origDisconnect.call(r.gain);
    routed.delete(el);
    // Hand the page's volume/muted values back to the real element
    volumeDesc.set.call(el, r.volume);
    mutedDesc.set.call(el, r.muted);
  }

  function attachSource(el, r) {
    if (r.source || r.stream.getAudioTracks().length === 0) return;
    r.source = getElementCtx().createMediaStreamSource(r.stream);
    origConnect.call(r.source, r.gain);
  }

  function route(el, stream) {
    const ctx = getElementCtx();
    const r = {
      stream,
      source: null,
      gain: ctx.createGain(),
      volume: volumeDesc.get.call(el),
      muted: mutedDesc.get.call(el)
    };
    routed.set(el, r);
    origConnect.call(r.gain, getChain(ctx).input);

    // The element must keep playing (muted) or Chromium won't feed the remote stream into Web Audio
    mutedDesc.set.call(el, true);
    attachSource(el, r);
    if (!r.source) {
      stream.addEventListener('addtrack', () => routed.get(el) === r && attachSource(el, r));
    }
    updateElementGain(el);
  }

  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    enumerable: srcObjectDesc.enumerable,
    get() {
      return srcObjectDesc.get.call(this);
    },
    set(value) {
      unroute(this);
      srcObjectDesc.set.call(this, value);
      if (value instanceof MediaStream) route(this, value);
    }
  });

  // While an element is routed, volume/muted act on its gain node; the real element stays muted
  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    configurable: true,
    enumerable: volumeDesc.enumerable,
    get() {
      const r = routed.get(this);
      return r ? r.volume : volumeDesc.get.call(this);
    },
    set(value) {
      const r = routed.get(this);
      if (!r) return volumeDesc.set.call(this, value);
      volumeDesc.set.call(this, value); // let the browser validate the value (throws on out of range)
      r.volume = value;
      updateElementGain(this);
    }
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
    configurable: true,
    enumerable: mutedDesc.enumerable,
    get() {
      const r = routed.get(this);
      return r ? r.muted : mutedDesc.get.call(this);
    },
    set(value) {
      const r = routed.get(this);
      if (!r) return mutedDesc.set.call(this, value);
      r.muted = Boolean(value);
      updateElementGain(this);
    }
  });

  for (const type of ['play', 'playing', 'pause', 'ended', 'emptied']) {
    document.addEventListener(type, (e) => updateElementGain(e.target), true);
  }

  // Follow the speaker the page picks for its media elements
  const origSetSinkId = HTMLMediaElement.prototype.setSinkId;
  if (origSetSinkId) {
    HTMLMediaElement.prototype.setSinkId = function (sinkId) {
      const result = origSetSinkId.call(this, sinkId);
      if (routed.has(this) && elementCtx && elementCtx.setSinkId) {
        elementCtx.setSinkId(sinkId).catch((err) => console.warn('[Gather] Audio boost setSinkId failed:', err));
      }
      return result;
    };
  }

  // The autoplay policy can leave contexts suspended until the user interacts with the page
  const resumeAll = () => {
    for (const ctx of chains.keys()) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('pointerdown', resumeAll, true);
  window.addEventListener('keydown', resumeAll, true);

  Object.defineProperty(window, KEY, {
    value: {
      setLevel(next) {
        level = presets[next] ? next : 'off';
        for (const [ctx, chain] of chains) {
          if (ctx.state === 'closed') chains.delete(ctx);
          else wire(chain);
        }
      }
    }
  });
}

module.exports = { installAudioBoost };
