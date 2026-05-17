/**
 * Deep-sea-mode-only ambient decoration: rising bubbles, slow-drifting fish
 * silhouettes, and shimmering caustic light bands.
 * Mounted once at app root; CSS hides it under any other mode.
 */
export default function DeepSea() {
  return (
    <div className="jz-deep-sea" aria-hidden>
      <div className="jz-caustics" />
      <div className="jz-godrays">
        <span className="jz-godray jz-godray-1" />
        <span className="jz-godray jz-godray-2" />
        <span className="jz-godray jz-godray-3" />
        <span className="jz-godray jz-godray-4" />
      </div>
      <div className="jz-biolume" />
      <div className="jz-bubbles">
        <span className="jz-bubble jz-bubble-1" />
        <span className="jz-bubble jz-bubble-2" />
        <span className="jz-bubble jz-bubble-3" />
        <span className="jz-bubble jz-bubble-4" />
        <span className="jz-bubble jz-bubble-5" />
        <span className="jz-bubble jz-bubble-6" />
        <span className="jz-bubble jz-bubble-7" />
        <span className="jz-bubble jz-bubble-8" />
      </div>
      <span className="jz-fish jz-fish-1" aria-label="鱼">🐠</span>
      <span className="jz-fish jz-fish-2" aria-label="鱼">🐟</span>
      <span className="jz-fish jz-fish-3" aria-label="鱼">🐡</span>
      <span className="jz-fish jz-fish-4" aria-label="鱼">🐟</span>
      <span className="jz-fish jz-fish-5" aria-label="鱼">🦐</span>
      <span className="jz-fish jz-fish-6" aria-label="鱼">🐠</span>
      <span className="jz-octopus" aria-label="章鱼">🐙</span>
      <svg className="jz-jellyfish" viewBox="0 0 80 110" aria-hidden>
        <defs>
          <radialGradient id="jzJellyBell" cx="50%" cy="40%" r="60%">
            <stop offset="0%"  stopColor="#fce7f3" stopOpacity="0.85"/>
            <stop offset="55%" stopColor="#c084fc" stopOpacity="0.55"/>
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <path
          d="M 8 38 Q 8 12 40 12 Q 72 12 72 38 Q 72 46 64 46 Q 56 50 56 38 Q 48 50 40 38 Q 32 50 24 38 Q 24 50 16 46 Q 8 46 8 38 Z"
          fill="url(#jzJellyBell)"
        />
        {/* Tentacles */}
        <path d="M 18 44 Q 16 70 20 100" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55"/>
        <path d="M 28 46 Q 26 76 32 102" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55"/>
        <path d="M 40 46 Q 42 78 38 104" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55"/>
        <path d="M 52 46 Q 50 76 56 102" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55"/>
        <path d="M 62 44 Q 60 70 64 100" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55"/>
      </svg>
    </div>
  );
}
