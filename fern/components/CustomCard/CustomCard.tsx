  import React from 'react';
  
  interface CustomCardProps {
    title: string;
    text: string;
    link: string;
    sparkle?: boolean;
  }

  export const CustomCard = ({ title, text, link, sparkle = false }: CustomCardProps) => {
      return (
          <a href={link} className="block p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
          <h2 className="text-xl font-semibold mb-2">
              {title} {sparkle && "✨"}
          </h2>
          <p className="text-gray-600">{text}</p>
          </a>
      );
  };
