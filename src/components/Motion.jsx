import React from "react";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";

/**
 * Motion primitives.
 *
 * Two rules the whole app follows:
 *   · Only transform and opacity move. Animating width or height forces
 *     layout on every frame and is what makes a page feel cheap.
 *   · Someone who asked their OS for less motion gets none of it — these
 *     components read that preference and render the final state directly
 *     rather than a faster version of the animation.
 */

const EASE = [0.16, 1, 0.3, 1];

/** A page. Rises slightly on entry, leaves faster than it arrived. */
export function Page({ children, className = "" }) {
  const still = useReducedMotion();
  return (
    <motion.main
      className={className}
      initial={still ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={still ? undefined : { opacity: 0, y: -6 }}
      transition={{ duration: still ? 0 : 0.3, ease: EASE }}
    >
      {children}
    </motion.main>
  );
}

/**
 * A block that reveals as it scrolls into view.
 *
 * For long reports where the reader arrives at a section rather than
 * landing on it. `once` so a section never re-animates when you scroll back
 * up, which is distracting on a page you're reading carefully.
 */
export function Reveal({ children, delay = 0, y = 14, className = "", as = "section" }) {
  const still = useReducedMotion();
  const Component = motion[as] || motion.section;
  return (
    <Component
      className={className}
      initial={still ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: still ? 0 : 0.45, ease: EASE, delay: still ? 0 : delay }}
    >
      {children}
    </Component>
  );
}

/** Staggers its children in on mount. Use for grids and lists. */
export function Stagger({ children, className = "", gap = 0.045 }) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: still ? 0 : gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", ...rest }) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: still ? { opacity: 1 } : { opacity: 0, y: 12 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * A number that counts up to its value on first paint.
 *
 * Used only on the one headline figure per screen. Applied to every number
 * on a page it becomes noise, and it delays the reader from seeing the value
 * they came for.
 */
export function CountUp({ value, decimals = 0, suffix = "", className = "" }) {
  const still = useReducedMotion();
  const [shown, setShown] = React.useState(still ? value : 0);

  React.useEffect(() => {
    if (still || typeof value !== "number") {
      setShown(value);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const duration = 700;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutExpo — fast to almost-there, then settles.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setShown(value * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, still]);

  return (
    <span className={className}>
      {typeof shown === "number" ? shown.toFixed(decimals) : shown}
      {suffix}
    </span>
  );
}


/**
 * Text that assembles itself as it scrolls into view.
 *
 * The string is split on spaces and each word rises independently with a
 * short stagger, so a headline reads as it lands rather than appearing all at
 * once. Words, not characters — per-character animation on a real sentence is
 * showy and slows the reader down.
 *
 * The whole string stays in the DOM as one accessible label; the spans are
 * hidden from assistive tech so a screen reader hears a sentence, not a list
 * of words.
 */
export function TextReveal({ text, className = "", as: Tag = "h2", delay = 0, stagger = 0.028 }) {
  const still = useReducedMotion();
  if (still) return <Tag className={className}>{text}</Tag>;

  const words = String(text).split(" ");
  return (
    <Tag className={className} aria-label={text}>
      <motion.span
        aria-hidden="true"
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, margin: "-40px" }}
        variants={{ shown: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
        style={{ display: "inline" }}
      >
        {words.map((word, i) => (
          // The clipping wrapper is what makes the word rise out of the line
          // rather than fade in place.
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
            <motion.span
              style={{ display: "inline-block" }}
              variants={{
                hidden: { y: "105%" },
                shown: { y: 0, transition: { duration: 0.6, ease: EASE } },
              }}
            >
              {word}
              {/* A hard space — inline-block words drop an ordinary one. */}
              {i < words.length - 1 ? " " : ""}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/** A hairline that draws itself left-to-right as the section arrives. */
export function RuleIn({ className = "" }) {
  const still = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className={className}
      initial={still ? false : { scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: still ? 0 : 0.7, ease: EASE }}
      style={{ transformOrigin: "left center" }}
    />
  );
}


/** How far down the page you are, as a hairline pinned to the top. */
export function ReadProgress() {
  const still = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const width = useSpring(scrollYProgress, { stiffness: 180, damping: 30, restDelta: 0.001 });
  if (still) return null;
  return <motion.div aria-hidden="true" className="read-progress" style={{ scaleX: width }} />;
}
