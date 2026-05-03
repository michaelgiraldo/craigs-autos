import type { JobEntry, LocaleKey } from '../../types/site';
import { BRAND_NAME, SITE } from '../../lib/site-data.js';

type JobData = JobEntry['data'];
type JobCopy = JobData['copy'][string];

const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const listHtml = (items: string[]): string =>
	items.length > 0 ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';

export function getJobCopy(job: JobData, locale: LocaleKey): JobCopy {
	return job.copy[locale] ?? job.copy.en;
}

export function buildJobDescriptionHtml(copy: JobCopy): string {
	return [
		`<p>${escapeHtml(copy.summary)}</p>`,
		`<p>${escapeHtml(copy.requirementsLead)}</p>`,
		`<h2>${escapeHtml(copy.experienceHeading)}</h2>`,
		listHtml(copy.experienceItems),
		`<h2>${escapeHtml(copy.automotiveHeading)}</h2>`,
		listHtml(copy.automotiveItems),
		`<h2>${escapeHtml(copy.photosHeading)}</h2>`,
		`<p>${escapeHtml(copy.photosLead)}</p>`,
		listHtml(copy.photoExamples),
	]
		.filter(Boolean)
		.join('');
}

export function buildJobPostingStructuredData(args: {
	job: JobData;
	locale: LocaleKey;
	title: string;
	canonicalUrl: string;
	logoUrl: string;
}): Record<string, unknown> | null {
	const { job, locale, title, canonicalUrl, logoUrl } = args;

	if (job.status !== 'open') {
		return null;
	}

	const copy = getJobCopy(job, locale);
	const salary =
		job.baseSalary?.minValue || job.baseSalary?.maxValue
			? {
					'@type': 'MonetaryAmount',
					currency: job.baseSalary.currency,
					value: {
						'@type': 'QuantitativeValue',
						...(job.baseSalary.minValue ? { minValue: job.baseSalary.minValue } : {}),
						...(job.baseSalary.maxValue ? { maxValue: job.baseSalary.maxValue } : {}),
						unitText: job.baseSalary.unitText,
					},
				}
			: null;

	return {
		'@context': 'https://schema.org/',
		'@type': 'JobPosting',
		title,
		description: buildJobDescriptionHtml(copy),
		identifier: {
			'@type': 'PropertyValue',
			name: BRAND_NAME,
			value: job.id,
		},
		datePosted: job.datePosted,
		...(job.validThrough ? { validThrough: job.validThrough } : {}),
		employmentType: job.employmentType.length === 1 ? job.employmentType[0] : job.employmentType,
		directApply: job.directApply ?? true,
		hiringOrganization: {
			'@type': 'Organization',
			name: BRAND_NAME,
			sameAs: SITE.url,
			logo: logoUrl,
		},
		jobLocation: {
			'@type': 'Place',
			address: {
				'@type': 'PostalAddress',
				streetAddress: job.jobLocation.streetAddress,
				addressLocality: job.jobLocation.addressLocality,
				addressRegion: job.jobLocation.addressRegion,
				postalCode: job.jobLocation.postalCode,
				addressCountry: job.jobLocation.addressCountry,
			},
		},
		url: canonicalUrl,
		industry: 'Auto upholstery',
		skills: [...copy.experienceItems, ...copy.automotiveItems, ...copy.toolsItems].join(', '),
		qualifications: `${copy.requirementsLead} ${copy.experienceItems.join(', ')}`,
		...(salary ? { baseSalary: salary } : {}),
	};
}
