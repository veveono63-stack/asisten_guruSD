import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from './Icons';

export interface AutocompleteInputProps {
    value: string;
    onChange: (value: string) => void;
    onSelect: (value: string) => void;
    options: string[];
    placeholder?: string;
    className?: string;
}

const AutocompleteInput: React.FC<AutocompleteInputProps> = ({ value, onChange, onSelect, options, placeholder, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

    // Filter options when input changes or dropdown opens
    useEffect(() => {
        if (isOpen) {
            const lowercasedValue = value.toLowerCase();
            const newFilteredOptions = options.filter(option =>
                option.toLowerCase().includes(lowercasedValue)
            );
            setFilteredOptions(newFilteredOptions);
            setActiveIndex(-1); // Reset active index on new filter
        }
    }, [value, isOpen, options]);

    // Calculate dropdown position
    useLayoutEffect(() => {
        const updatePosition = () => {
             if (isOpen && inputRef.current) {
                const rect = inputRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.bottom + window.scrollY,
                    left: rect.left + window.scrollX,
                    width: rect.width,
                });
            }
        };
        
        if (isOpen) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }

        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        }
    }, [isOpen]);
    
    // Handle clicks outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelect = (option: string) => {
        onSelect(option); // Notify parent of the selection. Parent is responsible for all state changes.
        setIsOpen(false);
    };
    
    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || filteredOptions.length === 0) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        };

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prevIndex => (prevIndex + 1) % filteredOptions.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prevIndex => (prevIndex - 1 + filteredOptions.length) % filteredOptions.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && filteredOptions[activeIndex]) {
                    handleSelect(filteredOptions[activeIndex]);
                } else if (filteredOptions.length > 0) {
                    handleSelect(filteredOptions[0]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    // Scroll active item into view
    useEffect(() => {
        if (listRef.current && activeIndex >= 0) {
            const activeItem = listRef.current.children[activeIndex] as HTMLLIElement;
            if (activeItem) {
                activeItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);
    
    const dropdown = isOpen && dropdownPosition && (
         createPortal(
            <ul
                ref={listRef}
                style={{
                    position: 'absolute',
                    top: `${dropdownPosition.top}px`,
                    left: `${dropdownPosition.left}px`,
                    width: `${dropdownPosition.width}px`,
                }}
                className="z-50 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto"
            >
                {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
                    <li
                        key={option}
                        onMouseDown={() => handleSelect(option)}
                        onMouseOver={() => setActiveIndex(index)}
                        className={`px-3 py-1.5 text-xs cursor-pointer ${
                            index === activeIndex ? 'bg-indigo-500 text-white' : 'text-gray-900 hover:bg-indigo-100'
                        }`}
                    >
                        {option}
                    </li>
                )) : (
                    <li className="px-3 py-1.5 text-xs text-gray-500 italic">Tidak ada hasil</li>
                )}
            </ul>,
            document.body
        )
    );
    
    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full p-1.5 pr-8 border border-gray-300 rounded-md text-xs"
                    autoComplete="off"
                />
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500 hover:text-gray-700"
                    aria-label="Toggle options"
                >
                    <ChevronDownIcon className="w-4 h-4" />
                </button>
            </div>
            {dropdown}
        </div>
    );
};

export default AutocompleteInput;