import { useState, useRef, useCallback } from "react";

export function ExpandableText({ 
  text, 
  maxLines = 3 
}: { 
  text: string; 
  maxLines?: number; 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldTruncate, setShouldTruncate] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const hasChecked = useRef(false);

  const checkTruncation = useCallback(() => {
    if (!textRef.current || !text || hasChecked.current) return;

    const tempDiv = document.createElement("div");
    tempDiv.style.position = "absolute";
    tempDiv.style.visibility = "hidden";
    tempDiv.style.width = `${textRef.current.clientWidth}px`;
    tempDiv.style.whiteSpace = "pre-wrap";
    tempDiv.style.fontSize = window.getComputedStyle(textRef.current).fontSize;
    tempDiv.style.lineHeight = window.getComputedStyle(textRef.current).lineHeight;
    tempDiv.style.fontFamily = window.getComputedStyle(textRef.current).fontFamily;
    tempDiv.textContent = text;
    
    document.body.appendChild(tempDiv);
    
    const lineHeight = parseFloat(window.getComputedStyle(tempDiv).lineHeight);
    const actualHeight = tempDiv.scrollHeight;
    const maxHeight = lineHeight * maxLines;
    
    const needsTruncation = actualHeight > maxHeight;
    document.body.removeChild(tempDiv);
    
    setShouldTruncate(needsTruncation);
    hasChecked.current = true;
  }, [text, maxLines]);

  const handleRef = useCallback((node: HTMLDivElement | null) => {
    textRef.current = node;
    hasChecked.current = false;
    if (node) {
      setTimeout(checkTruncation, 0);
    }
  }, [checkTruncation]);

  if (!text) return null;

  return (
    <div ref={handleRef}>
      <p 
        className="whitespace-pre-wrap"
        style={!isExpanded && shouldTruncate ? {
          display: "-webkit-box",
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden"
        } : undefined}
      >
        {text}
      </p>
      {shouldTruncate && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-primary hover:text-primary-focus mt-2 font-medium cursor-pointer underline"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
