import { Star } from "lucide-react";

interface Props {
  grade: number;
  size?: "sm" | "md" | "lg";
}

export function StarRating({ grade, size = "md" }: Props) {
  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-10 h-10",
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${sizeClasses[size]} transition-colors ${
            i <= grade
              ? "fill-warm text-warm"
              : "fill-transparent text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}
