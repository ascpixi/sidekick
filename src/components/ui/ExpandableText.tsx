import { useState, useRef, useEffect } from "react";

export function ExpandableText({ 
  text, 
  maxLines = 3 
}: { 
  text: string; 
  maxLines?: number; 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldTruncate, setShouldTruncate] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (textRef.current) {
      const lineHeight = parseInt(window.getComputedStyle(textRef.current).lineHeight);
      const actualHeight = textRef.current.scrollHeight;
      const maxHeight = lineHeight * maxLines;
      setShouldTruncate(actualHeight > maxHeight);
    }
  }, [text, maxLines]);

  if (!text) return null;

  if (!shouldTruncate) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div>
      <p 
        ref={textRef}
        className="whitespace-pre-wrap"
        style={{
          display: isExpanded ? 'block' : '-webkit-box',
          WebkitLineClamp: isExpanded ? 'none' : maxLines,
          WebkitBoxOrient: 'vertical' as any,
          overflow: isExpanded ? 'visible' : 'hidden'
        }}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-sm text-primary hover:text-primary-focus mt-2 font-medium cursor-pointer underline"
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}
