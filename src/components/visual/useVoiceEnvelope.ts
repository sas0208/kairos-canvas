import { useEffect, useRef, useState } from 'react';

export function useVoiceEnvelope(target: number, speed = 0.16) {
  const valueRef = useRef(target);
  const [value, setValue] = useState(target);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      valueRef.current += (target - valueRef.current) * speed;
      setValue(valueRef.current);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, speed]);

  return value;
}
