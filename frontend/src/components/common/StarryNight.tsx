/**
 * Dark-mode-only ambient decoration: stars, an occasional shooting star,
 * fireflies drifting across the viewport, and a faint crescent moon.
 * Mounted once at the app root; CSS keeps it invisible under light theme,
 * so there's no React state subscription needed when the theme toggles.
 */
export default function StarryNight() {
  return (
    <div className="jz-starry-night" aria-hidden>
      <div className="jz-milky-way" />
      <div className="jz-nebula jz-nebula-1" />
      <div className="jz-nebula jz-nebula-2" />
      <div className="jz-nebula jz-nebula-3" />
      <div className="jz-moon" />
      <div className="jz-stars jz-stars-small" />
      <div className="jz-stars jz-stars-medium" />
      <div className="jz-stars jz-stars-large" />
      <div className="jz-stars jz-stars-colored" />
      <div className="jz-shooting-star jz-shooting-star-1" />
      <div className="jz-shooting-star jz-shooting-star-2" />
      <div className="jz-shooting-star jz-shooting-star-3" />
      <div className="jz-shooting-star jz-shooting-star-4" />
      <div className="jz-shooting-star jz-shooting-star-5" />
      <div className="jz-shooting-star jz-shooting-star-6" />
      <div className="jz-firefly jz-firefly-1" />
      <div className="jz-firefly jz-firefly-2" />
      <div className="jz-firefly jz-firefly-3" />
      <div className="jz-firefly jz-firefly-4" />
    </div>
  );
}
