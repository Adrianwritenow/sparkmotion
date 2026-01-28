import React from "react";

interface EventCardProps {
  name: string;
  tourName?: string | null;
  status: string;
  bandCount: number;
  onClick?: () => void;
}

export function EventCard({ name, tourName, status, bandCount, onClick }: EventCardProps) {
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{name}</h3>
          {tourName && <p className="text-sm text-gray-500">{tourName}</p>}
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            status === "ACTIVE"
              ? "bg-green-100 text-green-800"
              : status === "DRAFT"
              ? "bg-yellow-100 text-yellow-800"
              : status === "COMPLETED"
              ? "bg-gray-100 text-gray-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {status}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-500">{bandCount} bands</p>
    </div>
  );
}
