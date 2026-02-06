import blackLeatherSeatBeforeReupholstery from '../../assets/images/before-after/car-seats/black-leather-seat-before-reupholstery.jpg';
import clothBucketSeatAfterSingle from '../../assets/images/before-after/car-seats/cloth-bucket-seat-after-reupholstery-single.jpg';
import clothBucketSeatsAfterPair from '../../assets/images/before-after/car-seats/cloth-bucket-seats-after-reupholstery-pair.jpg';
import lamborghiniSeatAfterClose from '../../assets/images/before-after/car-seats/lamborghini-seat-after-reupholstery-close.jpg';
import lamborghiniSeatBeforeClose from '../../assets/images/before-after/car-seats/lamborghini-seat-before-reupholstery-close.jpg';

export const CAR_SEATS_BEFORE_AFTER = [
	{
		id: 'lamborghini-blue-seat-reupholstery',
		stage: 'before-after',
		beforeAsset: lamborghiniSeatBeforeClose,
		afterAsset: lamborghiniSeatAfterClose,
		beforeAlt: { en: 'Lamborghini seat before reupholstery.' },
		afterAlt: { en: 'Lamborghini seat after reupholstery.' },
		beforeCaption: { en: 'Before - Lamborghini seat in worn blue cloth.' },
		afterCaption: { en: 'After - Lamborghini seat with finished custom upholstery.' },
	},
	{
		id: 'black-leather-seat-reupholstery-before',
		stage: 'before-only',
		beforeAsset: blackLeatherSeatBeforeReupholstery,
		beforeAlt: { en: 'Black leather seat set before reupholstery.' },
		beforeCaption: { en: 'Before - black leather seat set before reupholstery.' },
	},
	{
		id: 'cloth-bucket-seats-reupholstery-finished-pair',
		stage: 'after-only',
		afterAsset: clothBucketSeatsAfterPair,
		afterAlt: { en: 'Pair of cloth bucket seats after reupholstery.' },
		afterCaption: { en: 'After - pair of cloth bucket seats after reupholstery.' },
	},
	{
		id: 'cloth-bucket-seat-reupholstery-finished-single',
		stage: 'after-only',
		afterAsset: clothBucketSeatAfterSingle,
		afterAlt: { en: 'Single cloth bucket seat after reupholstery.' },
		afterCaption: { en: 'After - single cloth bucket seat after reupholstery.' },
	},
];
