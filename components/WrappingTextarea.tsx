
import React, { useRef, useLayoutEffect } from 'react';

interface WrappingTextareaProps {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled: boolean;
    placeholder?: string;
    className?: string;
    id?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    focusOnMount?: boolean;
    onFocusSet?: () => void;
}

const WrappingTextarea: React.FC<WrappingTextareaProps> = ({ 
    value, 
    onChange, 
    disabled, 
    placeholder, 
    className = '', 
    id, 
    onKeyDown, 
    focusOnMount, 
    onFocusSet 
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [value]);
    
    useLayoutEffect(() => {
        if (focusOnMount && textareaRef.current) {
            textareaRef.current.focus();
            onFocusSet?.();
        }
    }, [focusOnMount, onFocusSet]);

    return (
        <textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full p-2 border-none bg-transparent focus:outline-none focus:bg-indigo-50 rounded resize-none overflow-hidden block ${className}`}
            rows={1}
        />
    );
};

export default WrappingTextarea;
