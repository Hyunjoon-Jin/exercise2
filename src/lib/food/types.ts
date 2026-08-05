/** 앱 전체가 쓰는 정규화된 음식 표현. 어느 공급자에서 왔든 이 형태로 맞춘다. */
export interface FoodItem {
  /** 'MFDS:{식품코드}' 형태. foods 테이블의 PK 와 같은 규약. */
  code: string;
  name: string;
  brand: string | null;
  /** 영양성분 기준량 (예: 100) */
  servingSize: number;
  servingUnit: string;
  kcal: number | null;
  carbG: number | null;
  proteinG: number | null;
  fatG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  fiberG: number | null;
}

export interface FoodSearchResult {
  items: FoodItem[];
  totalCount: number;
  pageNo: number;
}

export class FoodApiError extends Error {
  // 파라미터 프로퍼티(constructor(readonly code: string))를 쓰지 않는 이유:
  // Node 의 타입 스트리핑은 타입 표기를 지우기만 하고 코드를 생성하지 않아
  // 파라미터 프로퍼티를 처리하지 못한다. 이 모듈은 node 로 직접 실행된다.
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "FoodApiError";
    this.code = code;
  }
}
