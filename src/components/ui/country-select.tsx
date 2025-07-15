
"use client";

import React, { useMemo } from 'react';
import Select from 'react-select';
import countryList from 'react-select-country-list';

interface CountrySelectProps {
    value: string;
    onChange: (e: any) => void;
    required?: boolean;
}

export function CountrySelect({ value, onChange, required }: CountrySelectProps) {
    const options = useMemo(() => countryList().getData(), []);

    const customStyles = {
        control: (provided: any, state: any) => ({
            ...provided,
            backgroundColor: 'hsl(var(--background))',
            borderColor: state.isFocused ? 'hsl(var(--ring))' : 'hsl(var(--input))',
            minHeight: '40px',
            boxShadow: state.isFocused ? '0 0 0 1px hsl(var(--ring))' : 'none',
            '&:hover': {
                borderColor: 'hsl(var(--ring))',
            }
        }),
        menu: (provided: any) => ({
            ...provided,
            backgroundColor: 'hsl(var(--popover))',
            color: 'hsl(var(--popover-foreground))',
        }),
        option: (provided: any, state: any) => ({
            ...provided,
            backgroundColor: state.isSelected ? 'hsl(var(--primary))' : state.isFocused ? 'hsl(var(--accent))' : 'transparent',
            color: state.isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--popover-foreground))',
            '&:active': {
                backgroundColor: 'hsl(var(--primary))',
            },
        }),
        singleValue: (provided: any) => ({
            ...provided,
            color: 'hsl(var(--foreground))',
        }),
        input: (provided: any) => ({
            ...provided,
            color: 'hsl(var(--foreground))',
        }),
        placeholder: (provided: any) => ({
            ...provided,
            color: 'hsl(var(--muted-foreground))',
        })
    };
    
    const selectedOption = options.find(option => option.value === value);

    return (
        <Select
            options={options}
            value={selectedOption}
            onChange={(option) => onChange({ target: { value: option?.value || '' } })}
            styles={customStyles}
            inputId="country-select"
            required={required}
            placeholder="Select a country..."
        />
    );
}
