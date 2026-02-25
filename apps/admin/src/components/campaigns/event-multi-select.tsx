"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface EventMultiSelectProps {
  events: Array<{ id: string; name: string; campaign?: { name: string } | null }>;
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function EventMultiSelect({
  events,
  selected,
  onChange,
}: EventMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleEvent = (eventId: string) => {
    const newSelected = selected.includes(eventId)
      ? selected.filter((id) => id !== eventId)
      : [...selected, eventId];
    onChange(newSelected);
  };

  const removeEvent = (eventId: string) => {
    onChange(selected.filter((id) => id !== eventId));
  };

  const selectedEvents = events.filter((event) =>
    selected.includes(event.id)
  );

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selected.length > 0
              ? `${selected.length} event(s) selected`
              : "Select events"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Search events..." />
            <CommandEmpty>No events found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {events.map((event) => (
                <CommandItem
                  key={event.id}
                  value={event.name}
                  disabled={!!event.campaign}
                  onSelect={() => !event.campaign && toggleEvent(event.id)}
                  className={event.campaign ? "opacity-50" : ""}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      selected.includes(event.id) ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span className={event.campaign ? "flex-1" : ""}>{event.name}</span>
                  {event.campaign && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                      <Megaphone className="h-3 w-3" />
                      {event.campaign.name}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Events Badges */}
      {selectedEvents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedEvents.map((event) => (
            <Badge key={event.id} variant="secondary" className="pr-1">
              {event.name}
              <button
                type="button"
                onClick={() => removeEvent(event.id)}
                className="ml-1 hover:bg-muted rounded-sm p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
