export function ImagePreview({ 
  imageUrl, 
  onClose 
}: { 
  imageUrl: string; 
  onClose: () => void; 
}) {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="relative max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <img 
          src={imageUrl} 
          alt="Project screenshot - full view"
          className="max-w-full max-h-full object-contain rounded-lg"
        />
        <button
          className="absolute top-4 right-4 btn btn-circle btn-lg bg-black bg-opacity-50 border-none text-white hover:bg-opacity-70 text-xl"
          onClick={onClose}
          aria-label="Close preview"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
