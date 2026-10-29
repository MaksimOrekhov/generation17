import momentsJson from '../../../content/moments/personal-time-t9.json'

/** ID моментов свободного времени T9: тесты совместимости отделяют ими прежний каталог от нового. */
export const T9_MOMENT_IDS = new Set((momentsJson as { id: string }[]).map(m => m.id))
