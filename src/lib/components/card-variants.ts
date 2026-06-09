import { cva, type VariantProps } from 'class-variance-authority';

export const cardVariants = cva(
	'rounded-[1.5rem] border border-white/40 bg-white/60 text-card-foreground shadow-xl backdrop-blur-xl transition-all hover:bg-white/70 hover:shadow-2xl',
	{
		variants: {
			variant: {
				default: 'border-white/40',
				destructive: 'border-destructive/50 text-destructive dark:border-destructive',
				outline: 'border-white/40 bg-transparent backdrop-blur-none shadow-none hover:shadow-none',
				secondary: 'border-transparent bg-secondary text-secondary-foreground',
				ghost: 'border-transparent shadow-none hover:shadow-none bg-transparent backdrop-blur-none'
			},
			size: {
				default: 'p-6',
				sm: 'p-4',
				lg: 'p-8'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
);

export type CardProps = VariantProps<typeof cardVariants>;
