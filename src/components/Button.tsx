import { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import { Link } from 'react-router';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface BaseButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

interface ButtonAsButtonProps extends BaseButtonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  href?: never;
  children: React.ReactNode;
  className?: string;
}

interface ButtonAsLinkProps extends BaseButtonProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'> {
  href: string;
  children: React.ReactNode;
  className?: string;
}

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent-violet)] hover:bg-[#7c3aed] text-white border border-transparent focus:ring-[var(--accent-violet)] shadow-[0_0_15px_rgba(139,92,246,0.3)]',
  secondary: 'glass glass-hover text-[var(--text-primary)] focus:ring-[var(--accent-violet)]',
  ghost: 'bg-transparent hover:bg-[rgba(255,255,255,0.05)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent focus:ring-[var(--accent-violet)]',
  danger: 'bg-[var(--accent-rose)] hover:bg-[#e11d48] text-white border border-transparent focus:ring-[var(--accent-rose)] shadow-[0_0_15px_rgba(244,63,94,0.3)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({ variant = 'primary', size = 'md', children, className = '', ...props }: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--bg-void)] disabled:opacity-50 disabled:cursor-not-allowed';
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if ('href' in props && props.href) {
    const { href, ...rest } = props as ButtonAsLinkProps;
    if (href.startsWith('http')) {
      return (
        <a href={href} className={classes} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link to={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
