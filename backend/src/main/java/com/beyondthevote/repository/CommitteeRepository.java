package com.beyondthevote.repository;

import com.beyondthevote.entity.Committee;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommitteeRepository extends JpaRepository<Committee, String> {
}
